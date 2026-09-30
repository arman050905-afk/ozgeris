const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer d0a669e38c98b345c171cfd652aa28b09db12e30eb82c8a4') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const email = (req.query && req.query.email) || (req.body && req.body.email);
  if (!email) { res.status(400).json({error:'email required'}); return; }
  await sql`update users set active=true where email=${email}`;
  res.status(200).json({ok:true});
};
