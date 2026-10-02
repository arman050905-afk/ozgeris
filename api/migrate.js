const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '79acce7efe1e6478f5e8b11a9f9db8ac2ef9cbb33e6de0da') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { action } = req.body || {};
  if (action === 'list-trial') {
    const rows = await sql`select id, name, phone, created_at from trial_users order by created_at desc`;
    return res.status(200).json({ users: rows });
  }
  if (action === 'delete-test-names') {
    const ids = await sql`select id from trial_users where name = 'Тест' or name = 'Нурлан' or name ilike 'Verify%' or name ilike 'Admin Test%'`;
    for (const u of ids) {
      await sql`delete from trial_data where user_id = ${u.id}`;
      await sql`delete from trial_users where id = ${u.id}`;
    }
    return res.status(200).json({ deleted: ids.length });
  }
  res.status(400).json({ error: 'unknown action' });
};
