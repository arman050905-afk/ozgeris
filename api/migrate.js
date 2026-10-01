const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer 69db1691e242595a512b3489f2a5b23ae9c3fc5ffc42db63') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`select id, name, phone, created_at from trial_users order by created_at desc`;
  res.status(200).json({ ok:true, count: rows.length, rows });
};
