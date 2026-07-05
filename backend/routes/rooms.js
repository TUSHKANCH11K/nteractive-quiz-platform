const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create room for a quiz
router.post('/', requireAuth, (req, res) => {
  const { quiz_id } = req.body;
  if (!quiz_id) return res.status(400).json({ error: 'Укажите ID квиза' });

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND organizer_id = ?').get(quiz_id, req.userId);
  if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });

  const qCount = db.prepare('SELECT COUNT(*) as c FROM questions WHERE quiz_id = ?').get(quiz_id).c;
  if (qCount === 0) return res.status(400).json({ error: 'Добавьте хотя бы один вопрос перед запуском' });

  let code = generateCode();
  let attempts = 0;
  while (db.prepare('SELECT id FROM rooms WHERE code = ?').get(code) && attempts < 10) {
    code = generateCode();
    attempts++;
  }

  const roomId = uuidv4();
  db.prepare(
    'INSERT INTO rooms (id, quiz_id, code, status, current_question_index, organizer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(roomId, quiz_id, code, 'waiting', -1, req.userId, Date.now());

  res.status(201).json({ code, roomId });
});

// Get room info by code (public)
router.get('/:code', (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  const quiz = db.prepare('SELECT id, title, category, description FROM quizzes WHERE id = ?').get(room.quiz_id);
  const participantCount = db.prepare('SELECT COUNT(*) as c FROM room_participants WHERE room_id = ?').get(room.id).c;

  res.json({ room: { code: room.code, status: room.status }, quiz, participantCount });
});

// Get room results
router.get('/:code/results', (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  const quiz = db.prepare('SELECT title, category FROM quizzes WHERE id = ?').get(room.quiz_id);
  const participants = db.prepare(
    'SELECT id, username, score FROM room_participants WHERE room_id = ? ORDER BY score DESC'
  ).all(room.id);

  res.json({ quiz, participants, status: room.status });
});

// Get rooms history for organizer
router.get('/my/hosted', requireAuth, (req, res) => {
  const rooms = db.prepare(`
    SELECT r.code, r.status, r.created_at,
           q.title as quiz_title, q.category,
           (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id) as participant_count
    FROM rooms r
    JOIN quizzes q ON r.quiz_id = q.id
    WHERE r.organizer_id = ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(req.userId);
  res.json(rooms);
});

module.exports = router;
