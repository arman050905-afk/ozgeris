const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer db6ddce4059477c91ac49ce60fc05e06f4f4700d87863ecd') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const action = (req.query && req.query.action) || (req.body && req.body.action) || 'list';
  if (action === 'list') {
    const rows = await sql`select id, name, email, active, is_admin, created_at from users where email like '%@example.com' order by created_at`;
    res.status(200).json({ ok:true, count: rows.length, rows });
    return;
  }
  if (action === 'delete_test') {
    const rows = await sql`delete from users where email like '%@example.com' and is_admin = false returning id, email`;
    res.status(200).json({ ok:true, deleted: rows.length, rows });
    return;
  }
  res.status(400).json({error:'unknown action'});
};
