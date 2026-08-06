const { sql } = require('../_db');
const { requireAdmin } = require('../_admin');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'тек админге рұқсат' });

  const { userId, active } = req.body || {};
  if (!userId || typeof active !== 'boolean') return res.status(400).json({ error: 'дұрыс параметр жоқ' });

  try {
    await sql`update users set active = ${active} where id = ${userId}`;
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
