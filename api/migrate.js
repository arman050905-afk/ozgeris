const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '3231e008aeb2692ace3c1b7b8beb8b4d215444d4000f326d') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { action, email } = req.body || {};
  if (action === 'inspect') {
    const exact = await sql`select id, name, email, active, is_admin, created_at from users where email = ${email}`;
    const ci = await sql`select id, name, email, active, is_admin, created_at from users where lower(email) = lower(${email})`;
    return res.status(200).json({ exact, caseInsensitive: ci });
  }
  res.status(400).json({ error: 'unknown action' });
};
