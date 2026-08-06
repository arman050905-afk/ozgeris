const bcrypt = require('bcryptjs');
const { sql } = require('./_db');
const { sign } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { email, pass } = req.body || {};
  const em = String(email || '').trim().toLowerCase();

  try {
    const rows = await sql`select id, name, email, pass_hash from users where email = ${em}`;
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Email не пароль қате' });

    const ok = await bcrypt.compare(String(pass || ''), user.pass_hash);
    if (!ok) return res.status(401).json({ error: 'Email не пароль қате' });

    const token = sign(user);
    res.status(200).json({ token, user: { name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
