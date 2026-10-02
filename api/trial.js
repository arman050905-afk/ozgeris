const jwt = require('jsonwebtoken');
const { sql } = require('./_db');
const { requireAdmin } = require('./_admin');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var орнатылмаған');
}
const SECRET = process.env.JWT_SECRET;

function sign(user) {
  return jwt.sign({ tuid: user.id, kind: 'trial' }, SECRET, { expiresIn: '180d' });
}
function verify(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRET);
    return p.kind === 'trial' ? p : null;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  // ---- Админ: сынама сайтқа кірген адамдардың тізімі (нағыз ÖZGERIS admin-і ғана) ----
  if (req.method === 'GET' && req.query && req.query.admin === '1') {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'тек админге рұқсат' });
    try {
      const rows = await sql`
        select tu.id, tu.name, tu.phone, tu.created_at, tu.quiz_answers, tu.change_index,
          tu.dream_text, tu.funnel_step, tu.last_seen_at, tu.whatsapp_clicked_at,
          coalesce(jsonb_array_length(td.data->'trackers'), 0) as tracker_count
        from trial_users tu
        left join trial_data td on td.user_id = tu.id
        order by tu.created_at desc
      `;
      return res.status(200).json({ users: rows });
    } catch (e) {
      return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
    }
  }

  // ---- Кіру: {action:'login', name, phone} — пароль жоқ, телефон бойынша тауып/жасап бірден кіреді ----
  if (req.method === 'POST' && req.body && req.body.action === 'login') {
    const { name, phone } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Атыңды жаз' });
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 7) return res.status(400).json({ error: 'Телефон нөмірін дұрыс жаз' });
    try {
      const existing = await sql`select id, name from trial_users where phone = ${phoneDigits}`;
      let user;
      if (existing.length) {
        user = existing[0];
        await sql`update trial_users set last_seen_at = now() where id = ${user.id}`;
      } else {
        const rows = await sql`insert into trial_users (name, phone, funnel_step, last_seen_at) values (${String(name).trim()}, ${phoneDigits}, 1, now()) returning id, name`;
        user = rows[0];
        await sql`insert into trial_data (user_id, data) values (${user.id}, '{}'::jsonb)`;
      }
      const token = sign(user);
      return res.status(200).json({ token, user: { name: user.name } });
    } catch (e) {
      return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
    }
  }

  // ---- Квиз қадамын бақылау: {action:'track', step} — қайдан бас тартатынын көру үшін ----
  if (req.method === 'POST' && req.body && req.body.action === 'track') {
    const payload = verify(req);
    if (!payload) return res.status(401).json({ error: 'unauthorized' });
    const step = Math.max(1, Math.min(9, +req.body.step || 1));
    try {
      await sql`update trial_users set funnel_step = greatest(funnel_step, ${step}), last_seen_at = now() where id = ${payload.tuid}`;
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: 'server error' }); }
  }

  // ---- Квиз аяқталғанда: {action:'complete-quiz', quizAnswers, changeIndex, dreamText} ----
  if (req.method === 'POST' && req.body && req.body.action === 'complete-quiz') {
    const payload = verify(req);
    if (!payload) return res.status(401).json({ error: 'unauthorized' });
    const { quizAnswers, changeIndex, dreamText } = req.body;
    try {
      await sql`
        update trial_users set
          quiz_answers = ${JSON.stringify(quizAnswers || {})}::jsonb,
          change_index = ${+changeIndex || null},
          dream_text = ${dreamText ? String(dreamText).slice(0, 500) : null},
          funnel_step = 8,
          offer_deadline = coalesce(offer_deadline, now() + interval '24 hours'),
          last_seen_at = now()
        where id = ${payload.tuid}
      `;
      const rows = await sql`select offer_deadline from trial_users where id = ${payload.tuid}`;
      return res.status(200).json({ ok: true, offerDeadline: rows[0] ? rows[0].offer_deadline : null });
    } catch (e) { return res.status(500).json({ error: 'server error' }); }
  }

  // ---- WhatsApp батырмасын басқанын белгілеу: {action:'whatsapp-click'} ----
  if (req.method === 'POST' && req.body && req.body.action === 'whatsapp-click') {
    const payload = verify(req);
    if (!payload) return res.status(401).json({ error: 'unauthorized' });
    try {
      await sql`update trial_users set whatsapp_clicked_at = now(), funnel_step = 9, last_seen_at = now() where id = ${payload.tuid}`;
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: 'server error' }); }
  }

  // ---- Деректер: GET/PUT, токен арқылы ----
  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        select td.data, tu.name, tu.offer_deadline, tu.whatsapp_clicked_at
        from trial_data td join trial_users tu on tu.id = td.user_id where td.user_id = ${payload.tuid}`;
      await sql`update trial_users set last_seen_at = now() where id = ${payload.tuid}`;
      return res.status(200).json({
        data: rows[0] ? rows[0].data : {}, name: rows[0] ? rows[0].name : '',
        offerDeadline: rows[0] ? rows[0].offer_deadline : null,
        whatsappClicked: rows[0] ? !!rows[0].whatsapp_clicked_at : false
      });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const data = (req.body && req.body.data) || {};
      await sql`
        insert into trial_data (user_id, data, updated_at)
        values (${payload.tuid}, ${JSON.stringify(data)}::jsonb, now())
        on conflict (user_id) do update set data = excluded.data, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
