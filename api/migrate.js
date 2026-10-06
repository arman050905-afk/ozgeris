const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '68e838c1f13eea4bb7a5de993cb6b235afa2226980926905') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { action, email } = req.body || {};
  if (action === 'list') {
    const rows = await sql`select id, name, email, active, is_admin, email_verified, created_at from users order by created_at desc`;
    return res.status(200).json({ rows });
  }
  if (action === 'delete') {
    const u = await sql`select id from users where email = ${email}`;
    if (u.length) { await sql`delete from user_data where user_id = ${u[0].id}`; await sql`delete from users where id = ${u[0].id}`; }
    return res.status(200).json({ deleted: u.length });
  }
  res.status(400).json({ error: 'unknown action' });
};
