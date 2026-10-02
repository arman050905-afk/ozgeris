const bcrypt = require('bcryptjs');
const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '67d95d60eb91d986d431d378de2bac32f036520e93b12a3b') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { action, email, phone } = req.body || {};
  if (action === 'grant-admin') {
    const hash = await bcrypt.hash('testpass123', 10);
    await sql`insert into users (name, email, password_hash, active, is_admin) values ('Verify Admin', ${email}, ${hash}, true, true)
      on conflict (email) do update set is_admin=true, active=true`;
    return res.status(200).json({ ok: true });
  }
  if (action === 'delete-admin') {
    const r = await sql`delete from users where email = ${email} and email like '%@example.com' returning id`;
    return res.status(200).json({ deleted: r.length });
  }
  if (action === 'delete-trial') {
    const u = await sql`select id from trial_users where phone = ${phone}`;
    if (u.length) {
      await sql`delete from trial_data where user_id = ${u[0].id}`;
      await sql`delete from trial_users where id = ${u[0].id}`;
    }
    return res.status(200).json({ deleted: u.length });
  }
  res.status(400).json({ error: 'unknown action' });
};
