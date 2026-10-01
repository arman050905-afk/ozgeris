const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer 26be39e9517a7ff5881c9a28546b139477244023672c11b8') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`delete from trial_users returning id`;
  res.status(200).json({ok:true, deleted: rows.length});
};
