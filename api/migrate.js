const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '6854098ed6ca0a4b8ef2af264c8c500450b088514e0732e6') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const { action, email } = req.body || {};
  if (action === 'force-unverify') {
    const r = await sql`update users set email_verified=false where email=${email} returning id, email_verified`;
    return res.status(200).json({ updated: r });
  }
  res.status(400).json({ error: 'unknown action' });
};
