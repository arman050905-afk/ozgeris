const { sql } = require('../_db');
const { verify } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  const endpoint = req.body && req.body.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'endpoint қажет' });

  try {
    await sql`delete from push_subscriptions where user_id = ${payload.uid} and endpoint = ${endpoint}`;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
