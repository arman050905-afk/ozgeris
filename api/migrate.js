const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer ba3783fdaba102b0d662f3fa96140e9ab17c119481e3c1fa') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`delete from users where email like '%@example.com' and is_admin = false returning id, email`;
  res.status(200).json({ok:true, deleted: rows.length});
};
