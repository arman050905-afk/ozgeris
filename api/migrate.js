const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer 881088a611c3f1934dfd4e198c8899b5521253ec2af8f16d') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const email = (req.query && req.query.email) || (req.body && req.body.email);
  if (!email) { res.status(400).json({error:'email required'}); return; }
  await sql`update users set active=true where email=${email}`;
  res.status(200).json({ok:true});
};
