const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer 35f8098d73ed65dec06a2adf803fdf19f89c249dd1dcf6f8') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`delete from users where email like '%@example.com' and is_admin = false returning id, email`;
  res.status(200).json({ok:true, deleted: rows.length});
};
