const { sql } = require('./_db');
const { verify } = require('./_auth');

module.exports = async (req, res) => {
  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  try {
    if (req.method === 'GET') {
      const rows = await sql`select data from user_data where user_id = ${payload.uid}`;
      return res.status(200).json({ data: rows[0] ? rows[0].data : {} });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const data = (req.body && req.body.data) || {};
      await sql`
        insert into user_data (user_id, data, updated_at)
        values (${payload.uid}, ${JSON.stringify(data)}::jsonb, now())
        on conflict (user_id) do update set data = excluded.data, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
