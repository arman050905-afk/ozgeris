const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer e8a740e822d0ff6de4439c741e1e53cdbc7e96f74a9db131') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  await sql`create table if not exists trial_users (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text not null unique,
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists trial_data (
    user_id uuid primary key references trial_users(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  )`;
  res.status(200).json({ok:true});
};
