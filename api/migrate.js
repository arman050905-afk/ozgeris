const { neon } = require('@neondatabase/serverless');
module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== 'ab6987eb3d219274e640959f6727bfd926faf80912c2438f') { res.status(401).json({error:'unauthorized'}); return; }
  const sql = neon(process.env.DATABASE_URL);
  const [users] = await sql`select count(*)::int as n from users`;
  const [trialUsers] = await sql`select count(*)::int as n from trial_users`;
  const sizes = await sql`
    select relname as table, pg_size_pretty(pg_total_relation_size(relid)) as size,
      pg_total_relation_size(relid) as bytes
    from pg_catalog.pg_statio_user_tables
    order by pg_total_relation_size(relid) desc
  `;
  const [dbSize] = await sql`select pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as bytes`;
  const [avgUserData] = await sql`select avg(pg_column_size(data))::int as avg_bytes, max(pg_column_size(data))::int as max_bytes from user_data`;
  res.status(200).json({ users: users.n, trialUsers: trialUsers.n, tableSizes: sizes, dbSize, avgUserData });
};
