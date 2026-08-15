const { sql } = require('../_db');
const { verify } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: 'subscription дұрыс емес' });
  }

  try {
    await sql`
      insert into push_subscriptions (user_id, endpoint, p256dh, auth)
      values (${payload.uid}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
      on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
    `;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
