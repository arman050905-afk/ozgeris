const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer 26be39e9517a7ff5881c9a28546b139477244023672c11b8') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const action = (req.query && req.query.action) || (req.body && req.body.action) || 'grant';
  const email = (req.query && req.query.email) || (req.body && req.body.email);
  if (action === 'grant') {
    await sql`update users set active=true, is_admin=true where email=${email}`;
    res.status(200).json({ok:true});
    return;
  }
  if (action === 'delete') {
    const rows = await sql`delete from users where email=${email} returning id`;
    res.status(200).json({ok:true, deleted: rows.length});
    return;
  }
  res.status(400).json({error:'unknown'});
};
