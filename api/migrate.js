const { sql } = require('./_db');

// Уақытша, бір реттік көмекші endpoint — телефон қатесін тексеру үшін тестілік
// аккаунтты белсендіру. CRON_SECRET-пен қорғалған, іске қосылған соң өшіріледі.
module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const h = req.headers.authorization || '';
  if (h !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' });

  const email = (req.query && req.query.email) || '';
  if (!email) return res.status(400).json({ error: 'email query param қажет' });

  try {
    await sql`update users set active = true where email = ${email}`;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
