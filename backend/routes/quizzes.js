const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

// Get all quizzes of the current user
router.get('/my', requireAuth, (req, res) => {
  const quizzes = db.prepare(
    'SELECT * FROM quizzes WHERE organizer_id = ? ORDER BY created_at DESC'
  ).all(req.userId);

  const result = quizzes.map(q => {
    const questionCount = db.prepare('SELECT COUNT(*) as c FROM questions WHERE quiz_id = ?').get(q.id).c;
    return { ...q, questionCount };
  });

  res.json(result);
});

// Get quiz history for participant
router.get('/history', requireAuth, (req, res) => {
  const rooms = db.prepare(`
    SELECT r.code, r.status, r.created_at, rp.score, rp.username,
           q.title as quiz_title, q.category,
           (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id) as participant_count
    FROM room_participants rp
    JOIN rooms r ON rp.room_id = r.id
    JOIN quizzes q ON r.quiz_id = q.id
    WHERE rp.user_id = ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(req.userId);
  res.json(rooms);
});

// Get single quiz with questions and options
router.get('/:id', requireAuth, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
  if (quiz.organizer_id !== req.userId) return res.status(403).json({ error: 'Нет доступа' });

  const questions = db.prepare(
    'SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index'
  ).all(quiz.id);

  for (const q of questions) {
    q.options = db.prepare('SELECT * FROM options WHERE question_id = ?').all(q.id);
  }

  res.json({ ...quiz, questions });
});

// Create quiz
router.post('/', requireAuth, (req, res) => {
  const { title, description, category, time_per_question, questions } = req.body;
  if (!title) return res.status(400).json({ error: 'Укажите название квиза' });

  const quizId = uuidv4();
  db.prepare(
    'INSERT INTO quizzes (id, title, description, category, time_per_question, organizer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(quizId, title, description || '', category || 'Общее', time_per_question || 30, req.userId, Date.now());

  if (questions && questions.length > 0) {
    saveQuestions(quizId, questions);
  }

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  res.status(201).json(quiz);
});

// Update quiz
router.put('/:id', requireAuth, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
  if (quiz.organizer_id !== req.userId) return res.status(403).json({ error: 'Нет доступа' });

  const { title, description, category, time_per_question, questions } = req.body;

  db.prepare(
    'UPDATE quizzes SET title = ?, description = ?, category = ?, time_per_question = ? WHERE id = ?'
  ).run(
    title || quiz.title,
    description ?? quiz.description,
    category || quiz.category,
    time_per_question || quiz.time_per_question,
    quiz.id
  );

  if (questions) {
    // Remove old questions/options
    const oldQuestions = db.prepare('SELECT id FROM questions WHERE quiz_id = ?').all(quiz.id);
    for (const oq of oldQuestions) {
      db.prepare('DELETE FROM options WHERE question_id = ?').run(oq.id);
    }
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quiz.id);
    saveQuestions(quiz.id, questions);
  }

  const updated = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quiz.id);
  const qs = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index').all(quiz.id);
  for (const q of qs) {
    q.options = db.prepare('SELECT * FROM options WHERE question_id = ?').all(q.id);
  }
  res.json({ ...updated, questions: qs });
});

// Delete quiz
router.delete('/:id', requireAuth, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
  if (quiz.organizer_id !== req.userId) return res.status(403).json({ error: 'Нет доступа' });

  const questions = db.prepare('SELECT id FROM questions WHERE quiz_id = ?').all(quiz.id);
  for (const q of questions) {
    db.prepare('DELETE FROM options WHERE question_id = ?').run(q.id);
  }
  db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quiz.id);
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.id);
  res.json({ success: true });
});

function saveQuestions(quizId, questions) {
  questions.forEach((q, index) => {
    const qId = uuidv4();
    db.prepare(
      'INSERT INTO questions (id, quiz_id, text, image_url, type, order_index) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(qId, quizId, q.text, q.image_url || null, q.type || 'single', index);

    if (q.options && q.options.length > 0) {
      for (const opt of q.options) {
        db.prepare(
          'INSERT INTO options (id, question_id, text, is_correct) VALUES (?, ?, ?, ?)'
        ).run(uuidv4(), qId, opt.text, opt.is_correct ? 1 : 0);
      }
    }
  });
}

module.exports = router;
