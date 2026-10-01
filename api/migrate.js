const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer b145a56979ace0c4d08c318bdf431853a55d2bcf9d1b872b') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const email = (req.query && req.query.email) || (req.body && req.body.email);
  if (!email) { res.status(400).json({error:'email required'}); return; }
  await sql`update users set active=true where email=${email}`;
  res.status(200).json({ok:true});
};
