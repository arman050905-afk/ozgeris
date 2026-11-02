const bcrypt = require('bcryptjs');
const { sql } = require('./_db');
const { requireAdmin } = require('./_admin');
const B = require('./_billing');

// Бұрынғы api/admin/{users,grant,reset-password}.js — Vercel Hobby 12-функция шегі үшін біріктірілді.
//   GET  /api/admin                                  — пайдаланушылар + төлем статистикасы
//   POST /api/admin {userId, active}                 — мәңгілік доступ беру/алу
//   POST /api/admin {userId, action:'extend', days}  — жазылымға күн қосу (қолмен төлегендерге)
//   POST /api/admin {userId, action:'resetPassword', newPass}
//   POST /api/admin {userId, action:'delete'}
module.exports = async (req, res) => {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'тек админге рұқсат' });

  try {
    await B.ensureBillingSchema();

    if (req.method === 'GET') {
      const users = await sql`
        select id, name, email, is_admin, active, paid_until, created_at
        from users order by created_at desc
      `;
      const stats = await sql`
        select
          count(*) filter (where status = 'COMPLETED' and paid_at >= date_trunc('month', now()))::int as month_count,
          coalesce(sum(amount) filter (where status = 'COMPLETED' and paid_at >= date_trunc('month', now())), 0)::int as month_sum,
          coalesce(sum(amount) filter (where status = 'COMPLETED'), 0)::int as total_sum,
          (select count(*)::int from users where paid_until > now() and not active) as active_subs
        from payments
      `;
      const payments = await sql`
        select p.amount, p.status, p.phone, p.created_at, p.paid_at, u.email
        from payments p join users u on u.id = p.user_id
        order by p.created_at desc limit 30
      `;
      return res.status(200).json({ users, stats: stats[0], payments, billingEnabled: !!B.XP_KEY });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    const { userId, active, action, days, newPass } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'дұрыс параметр жоқ' });

    if (action === 'delete') {
      if (userId === admin.uid) return res.status(400).json({ error: 'Өз аккаунтыңды өзің өшіре алмайсың' });
      await sql`delete from user_data where user_id = ${userId}`;
      await sql`delete from users where id = ${userId}`;
      return res.status(200).json({ ok: true });
    }

    if (action === 'resetPassword') {
      if (!newPass || String(newPass).length < 4) return res.status(400).json({ error: 'Пароль кемінде 4 таңба болу керек' });
      const hash = await bcrypt.hash(String(newPass), 10);
      await sql`update users set pass_hash = ${hash} where id = ${userId}`;
      return res.status(200).json({ ok: true });
    }

    if (action === 'extend') {
      const n = Math.round(Number(days) || B.PLAN_DAYS);
      if (n < 1 || n > 3660) return res.status(400).json({ error: 'дұрыс параметр жоқ' });
      const rows = await sql`
        update users
        set paid_until = greatest(coalesce(paid_until, now()), now()) + make_interval(days => ${n}), renew_stage = 0
        where id = ${userId} returning paid_until
      `;
      return res.status(200).json({ ok: true, paidUntil: rows[0] ? rows[0].paid_until : null });
    }

    if (typeof active !== 'boolean') return res.status(400).json({ error: 'дұрыс параметр жоқ' });
    if (userId === admin.uid && !active) return res.status(400).json({ error: 'Өз аккаунтыңның доступын өзің ала алмайсың' });
    await sql`update users set active = ${active} where id = ${userId}`;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('admin failed:', e);
    return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
