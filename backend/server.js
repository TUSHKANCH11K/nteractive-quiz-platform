const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const db = require('./database');
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quizzes');
const roomRoutes = require('./routes/rooms');
const { JWT_SECRET } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] },
});

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/rooms', roomRoutes);

// In-memory game state per room
const gameStates = new Map();

// ── Socket.IO ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  // Participant joins room lobby
  socket.on('room:join', ({ code, username, token }) => {
    try {
      const upperCode = code.toUpperCase();
      const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(upperCode);
      if (!room) return socket.emit('error', { message: 'Комната не найдена' });
      if (room.status === 'finished') return socket.emit('error', { message: 'Квиз уже завершён' });
      if (!username || username.trim().length < 2)
        return socket.emit('error', { message: 'Введите имя (минимум 2 символа)' });

      let userId = null;
      let displayName = username.trim();

      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          userId = decoded.userId;
          const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
          if (user) displayName = user.username;
        } catch {}
      }

      // Reconnect: find existing participant by user_id or username
      let participant = userId
        ? db.prepare('SELECT * FROM room_participants WHERE room_id = ? AND user_id = ?').get(room.id, userId)
        : db.prepare('SELECT * FROM room_participants WHERE room_id = ? AND username = ? AND user_id IS NULL').get(room.id, displayName);

      if (!participant) {
        const pid = uuidv4();
        db.prepare(
          'INSERT INTO room_participants (id, room_id, user_id, username, score, joined_at, socket_id) VALUES (?, ?, ?, ?, 0, ?, ?)'
        ).run(pid, room.id, userId || null, displayName, Date.now(), socket.id);
        participant = { id: pid, username: displayName, score: 0 };
      } else {
        db.prepare('UPDATE room_participants SET socket_id = ? WHERE id = ?').run(socket.id, participant.id);
        displayName = participant.username;
      }

      socket.join(upperCode);
      socket.data = { code: upperCode, participantId: participant.id, isOrganizer: false };

      const participants = db.prepare(
        'SELECT id, username, score FROM room_participants WHERE room_id = ? ORDER BY score DESC'
      ).all(room.id);

      socket.emit('room:joined', {
        room: { code: upperCode, status: room.status },
        participantId: participant.id,
        username: displayName,
        participants,
      });

      socket.to(upperCode).emit('room:participant_joined', {
        participant: { id: participant.id, username: displayName, score: 0 },
        participants,
      });

      // Reconnect mid-game: resend current question
      const gs = gameStates.get(upperCode);
      if (gs && room.status === 'active') {
        const q = gs.questions[gs.currentIndex];
        const timeLeft = Math.max(0, Math.round((gs.questionEndTime - Date.now()) / 1000));
        socket.emit('quiz:question', buildQuestionPayload(q, gs.currentIndex, gs.questions.length, timeLeft, gs.quiz.time_per_question));
      }
    } catch (err) {
      console.error('room:join error', err);
      socket.emit('error', { message: 'Ошибка подключения' });
    }
  });

  // Organizer connects to their room
  socket.on('room:host', ({ code, token }) => {
    try {
      const upperCode = code.toUpperCase();
      const decoded = jwt.verify(token, JWT_SECRET);
      const room = db.prepare('SELECT * FROM rooms WHERE code = ? AND organizer_id = ?').get(upperCode, decoded.userId);
      if (!room) return socket.emit('error', { message: 'Комната не найдена' });

      socket.join(upperCode);
      socket.data = { code: upperCode, isOrganizer: true, organizerId: decoded.userId };

      const participants = db.prepare(
        'SELECT id, username, score FROM room_participants WHERE room_id = ? ORDER BY score DESC'
      ).all(room.id);
      const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(room.quiz_id);

      socket.emit('room:host_joined', {
        room: { code: upperCode, status: room.status },
        quiz,
        participants,
      });

      // Reconnect mid-game
      const gs = gameStates.get(upperCode);
      if (gs && room.status === 'active') {
        const q = gs.questions[gs.currentIndex];
        const timeLeft = Math.max(0, Math.round((gs.questionEndTime - Date.now()) / 1000));
        socket.emit('quiz:question', {
          ...buildQuestionPayload(q, gs.currentIndex, gs.questions.length, timeLeft, gs.quiz.time_per_question),
          answerCounts: gs.answerCounts,
          answeredCount: gs.answeredParticipants.size,
        });
      }
    } catch (err) {
      console.error('room:host error', err);
      socket.emit('error', { message: 'Ошибка авторизации' });
    }
  });

  // Organizer starts the quiz
  socket.on('quiz:start', ({ code, token }) => {
    try {
      const upperCode = code.toUpperCase();
      const decoded = jwt.verify(token, JWT_SECRET);
      const room = db.prepare('SELECT * FROM rooms WHERE code = ? AND organizer_id = ?').get(upperCode, decoded.userId);
      if (!room || room.status !== 'waiting') return;

      const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(room.quiz_id);
      const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index').all(room.quiz_id);
      if (questions.length === 0) return socket.emit('error', { message: 'В квизе нет вопросов' });

      for (const q of questions) {
        q.options = db.prepare('SELECT * FROM options WHERE question_id = ?').all(q.id);
      }

      db.prepare("UPDATE rooms SET status = 'active', current_question_index = 0 WHERE code = ?").run(upperCode);

      gameStates.set(upperCode, {
        questions,
        currentIndex: 0,
        quiz,
        roomId: room.id,
        answerCounts: {},
        answeredParticipants: new Set(),
        questionEndTime: 0,
        timer: null,
        questionEnded: false,
      });

      io.to(upperCode).emit('quiz:started', { total: questions.length });
      setTimeout(() => sendQuestion(upperCode), 1500);
    } catch (err) {
      console.error('quiz:start error', err);
    }
  });

  // Organizer manually advances to next question
  socket.on('quiz:next', ({ code, token }) => {
    try {
      const upperCode = code.toUpperCase();
      const decoded = jwt.verify(token, JWT_SECRET);
      const room = db.prepare('SELECT * FROM rooms WHERE code = ? AND organizer_id = ?').get(upperCode, decoded.userId);
      if (!room) return;

      const gs = gameStates.get(upperCode);
      if (!gs || gs.questionEnded) return;

      if (gs.timer) { clearTimeout(gs.timer); gs.timer = null; }
      endQuestion(upperCode);
    } catch {}
  });

  // Participant submits answer
  socket.on('quiz:answer', ({ code, participantId, optionIds }) => {
    try {
      const upperCode = code.toUpperCase();
      const gs = gameStates.get(upperCode);
      if (!gs || gs.questionEnded) return;
      if (gs.answeredParticipants.has(participantId)) return;

      const question = gs.questions[gs.currentIndex];
      const participant = db.prepare('SELECT * FROM room_participants WHERE id = ?').get(participantId);
      if (!participant) return;

      gs.answeredParticipants.add(participantId);

      const ids = Array.isArray(optionIds) ? optionIds : [optionIds];
      for (const oid of ids) {
        gs.answerCounts[oid] = (gs.answerCounts[oid] || 0) + 1;
      }

      const correctIds = question.options.filter(o => o.is_correct).map(o => o.id);
      let isCorrect = false;
      if (question.type === 'single') {
        isCorrect = ids.length === 1 && correctIds.includes(ids[0]);
      } else {
        const sel = new Set(ids);
        const cor = new Set(correctIds);
        isCorrect = sel.size === cor.size && [...sel].every(id => cor.has(id));
      }

      const timeLeft = Math.max(0, gs.questionEndTime - Date.now());
      const timeLimit = gs.quiz.time_per_question;
      const timeBonus = isCorrect ? Math.round((timeLeft / (timeLimit * 1000)) * 500) : 0;
      const points = isCorrect ? 500 + timeBonus : 0;

      if (isCorrect) {
        db.prepare('UPDATE room_participants SET score = score + ? WHERE id = ?').run(points, participantId);
      }

      db.prepare(
        'INSERT INTO answers (id, room_id, question_id, participant_id, selected_option_ids, is_correct, points, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), gs.roomId, question.id, participantId, JSON.stringify(ids), isCorrect ? 1 : 0, points, Date.now());

      socket.emit('quiz:answer_result', { isCorrect, points, correctIds });

      io.to(upperCode).emit('quiz:answer_count', {
        counts: gs.answerCounts,
        answeredCount: gs.answeredParticipants.size,
      });

      // Auto-advance if everyone answered
      const total = db.prepare('SELECT COUNT(*) as c FROM room_participants WHERE room_id = ?').get(gs.roomId).c;
      if (gs.answeredParticipants.size >= total && !gs.questionEnded) {
        if (gs.timer) { clearTimeout(gs.timer); gs.timer = null; }
        setTimeout(() => endQuestion(upperCode), 600);
      }
    } catch (err) {
      console.error('quiz:answer error', err);
    }
  });

  socket.on('disconnect', () => {
    // Participant stays in DB for reconnect
  });
});

// ── Game Logic ─────────────────────────────────────────────────────────────

function sendQuestion(code) {
  const gs = gameStates.get(code);
  if (!gs) return;

  gs.answerCounts = {};
  gs.answeredParticipants = new Set();
  gs.questionEnded = false;

  const q = gs.questions[gs.currentIndex];
  const timeLimit = gs.quiz.time_per_question;
  gs.questionEndTime = Date.now() + timeLimit * 1000;

  db.prepare('UPDATE rooms SET current_question_index = ? WHERE code = ?').run(gs.currentIndex, code);

  io.to(code).emit('quiz:question', buildQuestionPayload(q, gs.currentIndex, gs.questions.length, timeLimit, timeLimit));

  gs.timer = setTimeout(() => endQuestion(code), timeLimit * 1000);
}

function endQuestion(code) {
  const gs = gameStates.get(code);
  if (!gs || gs.questionEnded) return;
  gs.questionEnded = true;

  const q = gs.questions[gs.currentIndex];
  const correctIds = q.options.filter(o => o.is_correct).map(o => o.id);

  io.to(code).emit('quiz:question_end', {
    correctIds,
    answerCounts: gs.answerCounts,
    answeredCount: gs.answeredParticipants.size,
  });

  setTimeout(() => {
    const leaderboard = getLeaderboard(code);
    const isLast = gs.currentIndex >= gs.questions.length - 1;
    io.to(code).emit('quiz:leaderboard', { leaderboard, isLast });

    setTimeout(() => {
      gs.currentIndex++;
      if (gs.currentIndex >= gs.questions.length) {
        db.prepare("UPDATE rooms SET status = 'finished' WHERE code = ?").run(code);
        const final = getLeaderboard(code);
        io.to(code).emit('quiz:finished', { leaderboard: final });
        gameStates.delete(code);
      } else {
        sendQuestion(code);
      }
    }, 4000);
  }, 2500);
}

function buildQuestionPayload(q, index, total, timeLeft, timeLimit) {
  return {
    question: {
      id: q.id,
      text: q.text,
      image_url: q.image_url,
      type: q.type,
      options: q.options.map(o => ({ id: o.id, text: o.text })),
    },
    index,
    total,
    timeLeft,
    timeLimit,
  };
}

function getLeaderboard(code) {
  return db.prepare(`
    SELECT rp.id, rp.username, rp.score
    FROM room_participants rp
    JOIN rooms r ON rp.room_id = r.id
    WHERE r.code = ?
    ORDER BY rp.score DESC
    LIMIT 20
  `).all(code);
}

// ──────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅  Server running on http://localhost:${PORT}`);
});
