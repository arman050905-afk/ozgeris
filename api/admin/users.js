const { sql } = require('../_db');
const { requireAdmin } = require('../_admin');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'тек админге рұқсат' });

  try {
    const rows = await sql`
      select id, name, email, is_admin, active, created_at
      from users order by created_at desc
    `;
    res.status(200).json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
