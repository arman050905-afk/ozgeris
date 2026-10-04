const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== 'd04a530e9a10a4624afd2aecb5a84edcbf4dcc784c8f50ba') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { email } = req.body || {};
  const r = await sql`update users set active=true where email = ${email} returning id, email, active`;
  res.status(200).json({ updated: r });
};
