const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== '056001c929f6f87f113da49064ec40b4d3337b0a33bb03d0') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  await sql`alter table users add column if not exists email_verified boolean not null default false`;
  await sql`alter table users add column if not exists verify_code text`;
  await sql`alter table users add column if not exists verify_code_expires timestamptz`;
  // бар аккаунттар (бұл баған болмай тұрып тіркелгендер) қолданбаны қолданып жүр —
  // оларды растау талап етіп доступ жауып тастамас үшін бірден расталған деп белгілейміз
  const r = await sql`update users set email_verified=true where email_verified=false returning id`;
  res.status(200).json({ ok: true, backfilled: r.length });
};
