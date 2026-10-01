const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer ae7a3a94b6ffa4e3a683c160f7ab88cb68f7a4da793dec5c') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`delete from users where email like '%@example.com' and is_admin = false returning id, email`;
  res.status(200).json({ok:true, deleted: rows.length});
};
