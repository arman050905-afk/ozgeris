const bcrypt = require('bcryptjs');
const { sql } = require('./_db');
const { sign } = require('./_auth');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { name, email, pass } = req.body || {};
  if (!name || !email || !pass) return res.status(400).json({ error: 'Барлық өрісті толтыр' });

  const em = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return res.status(400).json({ error: 'Email дұрыс емес' });
  if (String(pass).length < 4) return res.status(400).json({ error: 'Пароль кемінде 4 таңба' });

  try {
    const existing = await sql`select id from users where email = ${em}`;
    if (existing.length) return res.status(409).json({ error: 'Бұл email тіркелген — кіріп көр' });

    const hash = await bcrypt.hash(pass, 10);
    const rows = await sql`
      insert into users (name, email, pass_hash)
      values (${String(name).trim()}, ${em}, ${hash})
      returning id, name, email
    `;
    const user = rows[0];
    await sql`insert into user_data (user_id, data) values (${user.id}, '{}'::jsonb)`;

    const token = sign(user);
    res.status(200).json({ token, user: { name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
