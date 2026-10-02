const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer 0126670d78dd79d7d542308eabeb5f00b20e0461d3bebf08') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  await sql`alter table trial_users add column if not exists quiz_answers jsonb`;
  await sql`alter table trial_users add column if not exists change_index int`;
  await sql`alter table trial_users add column if not exists dream_text text`;
  await sql`alter table trial_users add column if not exists funnel_step int default 1`;
  await sql`alter table trial_users add column if not exists last_seen_at timestamptz default now()`;
  await sql`alter table trial_users add column if not exists whatsapp_clicked_at timestamptz`;
  await sql`alter table trial_users add column if not exists offer_deadline timestamptz`;
  res.status(200).json({ok:true});
};
