const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var орнатылмаған (Vercel Project Settings → Environment Variables)');
}

const SECRET = process.env.JWT_SECRET;

function sign(user) {
  return jwt.sign({ uid: user.id, email: user.email }, SECRET, { expiresIn: '180d' });
}

function verify(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
}

module.exports = { sign, verify };
