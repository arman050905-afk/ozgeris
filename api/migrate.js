const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer 69db1691e242595a512b3489f2a5b23ae9c3fc5ffc42db63') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const action = (req.query && req.query.action) || 'list';
  if (action === 'deleteall_v2') {
    const rows = await sql`delete from trial_users returning id`;
    res.status(200).json({ ok:true, version:'v2', deleted: rows.length });
    return;
  }
  const rows = await sql`select id, name, phone, created_at from trial_users order by created_at desc`;
  res.status(200).json({ ok:true, version:'v2', count: rows.length, rows });
};
