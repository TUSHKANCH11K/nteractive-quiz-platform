const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'vk-quiz-secret-2024';

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
