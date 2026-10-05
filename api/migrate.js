const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '8d0b6c0749f8dc8f9b67d397dfd694e46853f85dcac9b5e9') { res.status(401).json({error:'unauthorized'}); return; }
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
