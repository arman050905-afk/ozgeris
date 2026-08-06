const { sql } = require('./_db');
const { verify } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  try {
    const rows = await sql`select name, email, is_admin, active from users where id = ${payload.uid}`;
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'not found' });
    res.status(200).json({ user });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
