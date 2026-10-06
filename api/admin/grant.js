const { sql } = require('../_db');
const { requireAdmin } = require('../_admin');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'тек админге рұқсат' });

  const { userId, active, action } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'дұрыс параметр жоқ' });

  if (action === 'delete') {
    if (userId === admin.uid) {
      return res.status(400).json({ error: 'Өз аккаунтыңды өзің өшіре алмайсың' });
    }
    try {
      await sql`delete from user_data where user_id = ${userId}`;
      await sql`delete from users where id = ${userId}`;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
    }
  }

  if (typeof active !== 'boolean') return res.status(400).json({ error: 'дұрыс параметр жоқ' });
  if (userId === admin.uid && !active) {
    return res.status(400).json({ error: 'Өз аккаунтыңның доступын өзің ала алмайсың' });
  }

  try {
    await sql`update users set active = ${active} where id = ${userId}`;
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
