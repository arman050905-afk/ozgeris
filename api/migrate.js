const { sql } = require('./_db');

// Уақытша, бір реттік migration endpoint — schema.sql-дың production базада әлі
// орындалмаған бөлігін (last_reminder_sent_at) осы арқылы қолданамыз, себебі Neon SQL
// Editor-ге қол жеткізу осы сессияда мүмкін емес. Іске қосылған соң бұл файл өшіріледі
// (12-функция шегін сақтау үшін тұрақты қалмайды). CRON_SECRET-пен қорғалған.
module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const h = req.headers.authorization || '';
  if (h !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' });

  try {
    await sql`alter table users add column if not exists last_reminder_sent_at timestamptz`;
    const check = await sql`
      select column_name from information_schema.columns
      where table_name = 'users' and column_name = 'last_reminder_sent_at'
    `;
    return res.status(200).json({ ok: true, column_present: check.length > 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
