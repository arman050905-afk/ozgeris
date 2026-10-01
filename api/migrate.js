const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer 9f2ae6e329e250c40202db51b7b482d91f843421ae42d06b') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`delete from users where email like '%@example.com' and is_admin = false returning id, email`;
  res.status(200).json({ok:true, deleted: rows.length});
};
