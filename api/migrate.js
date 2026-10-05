const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '0730620d1de8eb2d972f70f514b8952a6c83b577235b79ce') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { action, email } = req.body || {};
  if (action === 'activate') {
    const r = await sql`update users set active=true where email = ${email} returning id, email`;
    return res.status(200).json({ updated: r });
  }
  if (action === 'delete') {
    const u = await sql`select id from users where email = ${email}`;
    if (u.length) {
      await sql`delete from user_data where user_id = ${u[0].id}`;
      await sql`delete from users where id = ${u[0].id}`;
    }
    return res.status(200).json({ deleted: u.length });
  }
  res.status(400).json({ error: 'unknown action' });
};
