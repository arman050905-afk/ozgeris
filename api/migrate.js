const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '6854098ed6ca0a4b8ef2af264c8c500450b088514e0732e6') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { action, email } = req.body || {};
  if (action === 'inspect') {
    const rows = await sql`select id, name, email, email_verified, verify_code, verify_code_expires, active, created_at from users where email = ${email}`;
    return res.status(200).json({ rows });
  }
  if (action === 'force-unverify') {
    const r = await sql`update users set email_verified=false where email=${email} returning id`;
    return res.status(200).json({ updated: r.length });
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
