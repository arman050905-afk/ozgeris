const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '47cc3d193b70e1ce5b0fc75b92de158c4add94029cbbdd84') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { email } = req.body || {};
  const u = await sql`select id from users where email = ${email}`;
  if (u.length) { await sql`delete from user_data where user_id = ${u[0].id}`; await sql`delete from users where id = ${u[0].id}`; }
  res.status(200).json({ deleted: u.length });
};
