const bcrypt = require('bcryptjs');
const { sql } = require('../_db');
const { requireAdmin } = require('../_admin');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'тек админге рұқсат' });

  const { userId, newPass } = req.body || {};
  if (!userId || !newPass || String(newPass).length < 4) {
    return res.status(400).json({ error: 'Пароль кемінде 4 таңба болу керек' });
  }

  try {
    const hash = await bcrypt.hash(String(newPass), 10);
    await sql`update users set pass_hash = ${hash} where id = ${userId}`;
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
