const { sql } = require('./_db');
const B = require('./_billing');

// Email-воронка — api/cron/check-alerts.js әр тексерісте (cron-job.org, ~15 мин) шақырады.
//  1) Тіркеліп, email растап, бірақ әлі төлемегендер: 4 хат (тіркелгеннен 1 сағ / 1 / 3 / 6 күн өткен соң,
//     арасы кемінде 20 сағат). users.funnel_stage — қай хатқа дейін жіберілгені.
//  2) Жазылымы бітіп жатқандар: бітуге 3 күн қалғанда / біткен күні / 5 күннен кейін.
//     users.renew_stage — әр төлемде 0-ге түседі (markPaid).
// Хат тек XPAYMENT_API_KEY орнатылғанда жүреді — автоматты төлемсіз «Kaspi арқылы аш» деп жазу мағынасыз.
const MAX_PER_RUN = 20;
const GAP_MS = 600; // Resend: секундына ~2 сұраныс

const PRICE = () => String(B.PRICE_KZT).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const PER_DAY = () => Math.round(B.PRICE_KZT / B.PLAN_DAYS);
const fmtDate = (d) => new Date(d).toLocaleDateString('ru-RU', { timeZone: 'Asia/Almaty' });
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const firstName = (n) => esc(String(n || '').trim().split(/\s+/)[0] || 'досым');

const SALES = [
  null,
  {
    afterH: 1,
    subject: (u) => `${firstName(u.name)}, бір қадам қалды`,
    body: (u) => `
      <p>Сәлем, ${firstName(u.name)}!</p>
      <p>Сен ÖZGERIS-ке тіркелдің. «Бір күні бастаймын» деп жүргендердің көбі осы қадамға да жетпейді.</p>
      <p>Толық доступ ашылғанда сенде болады:</p>
      ${list([
        'Әдет трекерлері — күнделікті серия (streak) мен прогресс',
        'Қаржы — кіріс-шығын, міндетті төлемдер, қарыздар, мақсаттар',
        'Ұйқы, көңіл-күй, мазасыздық (GAD-7) бақылауы',
        'Мақсат пен жоспар, шүкіршілік күнделігі',
      ])}
      <p>Бағасы — айына <b>${PRICE()} ₸</b> (күніне ~${PER_DAY()} ₸). Kaspi арқылы 1 минутта төлейсің, доступ бірден ашылады.
      Ақша өзінен-өзі шешілмейді — келесі айды өзің шешесің.</p>`,
    cta: 'Kaspi арқылы ашу',
  },
  {
    afterH: 24,
    subject: () => 'Өзгеріс дүйсенбіден басталмайды',
    body: (u) => `
      <p>Сәлем, ${firstName(u.name)}!</p>
      <p>Көп адам «дүйсенбіден бастаймын», «жаңа айдан бастаймын» дейді. Дүйсенбі келеді — бәрі баяғыдай қала береді.</p>
      <p>Өзгеріс үлкен шешімнен емес, күнде қайталанатын кішкентай әрекеттен туады. ÖZGERIS дәл соған арналған:
      күніне 2–3 минут — белгі қоясың, серияң өседі, прогресс көз алдыңда тұрады. Тізбекті үзгің келмейді. Бар құпия осы.</p>
      <p>Бүгін бастасаң, 30 күннен кейін бүгінгі өзіңе рахмет айтасың.</p>`,
    cta: `Бүгін бастау — ${PRICE()} ₸`,
  },
  {
    afterH: 72,
    subject: () => 'Айлығың қайда кетіп жатыр?',
    body: (u) => `
      <p>Сәлем, ${firstName(u.name)}!</p>
      <p>Айлық түседі, ал ай соңында «ақша қайда кетті?» деген сұрақ қалады. Таныс па?</p>
      <p>ÖZGERIS-тің Қаржы бөлімінде:</p>
      ${list([
        'Кіріс пен шығынды санат бойынша көресің',
        'Несие, жазылым, коммуналка мерзімін ұмытпайсың — push келеді',
        'Кімге қарыз бердің, кімнен алдың — бәрі есепте',
        'Ақша жинау мақсатыңның қанша пайызы толғанын көресің',
      ])}
      <p>Бір айлық жазылым — ${PRICE()} ₸. Кафеге бір барғаннан арзан, ал бүкіл айдың ақшасын бақылайсың.</p>`,
    cta: 'Қаржымды ретке келтіру',
  },
  {
    afterH: 144,
    subject: () => 'Соңғы хат',
    body: (u) => `
      <p>Сәлем, ${firstName(u.name)}!</p>
      <p>Бұл ÖZGERIS туралы саған жазатын соңғы хатым, артық мазаламаймын.</p>
      <p>Өмірді өзгертуге «дайын» кезең ешқашан болмайды: уақыт жоқ, ақша жоқ, көңіл жоқ — себеп әрқашан табылады.
      Бір жылдан кейін сен не бүгін бастаған адам боласың, не әлі «бір күні» деп жүрген адам.</p>
      <p>${PRICE()} ₸, Kaspi арқылы 1 минут. Ұнамаса — келесі айға төлемейсің, болды.</p>`,
    cta: 'ÖZGERIS-ті ашу',
  },
];

const RENEW = [
  null,
  {
    subject: (u) => `Жазылымың ${fmtDate(u.paid_until)} аяқталады`,
    body: (u) => `
      <p>Сәлем, ${firstName(u.name)}!</p>
      <p>ÖZGERIS жазылымың <b>${fmtDate(u.paid_until)}</b> аяқталады. Серияң үзілмей тұрғанда ұзартып қой —
      ${PRICE()} ₸, Kaspi арқылы 1 минут. Қосылған ${B.PLAN_DAYS} күн ағымдағы мерзімнің үстіне жалғанады, бір күн де жоғалмайды.</p>`,
    cta: 'Жазылымды ұзарту',
  },
  {
    subject: () => 'Жазылымың аяқталды — деректерің сақтаулы',
    body: (u) => `
      <p>Сәлем, ${firstName(u.name)}!</p>
      <p>Жазылымың аяқталды, сондықтан доступ уақытша жабылды. Уайымдама: трекерлерің, қаржы жазбаларың — бәрі сақтаулы.
      Төлегеннен кейін бәрі сол қалпында ашылады.</p>`,
    cta: `Доступты қайта ашу — ${PRICE()} ₸`,
  },
  {
    subject: () => 'Серияң сені күтіп тұр',
    body: (u) => `
      <p>Сәлем, ${firstName(u.name)}!</p>
      <p>Біраз уақыт болды. Әдет бір апта үзілсе, қайта бастау қиындай береді — бірақ әлі кеш емес.
      Деректерің сақтаулы, бір минутта бәрі қайта ашылады.</p>`,
    cta: 'Қайта бастау',
  },
];

function list(items) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 14px">${items.map((i) => `
    <tr><td style="vertical-align:top;padding:4px 10px 4px 0;color:#7c5cff;font-weight:800">✓</td>
    <td style="padding:4px 0;font-size:15px;line-height:1.5">${i}</td></tr>`).join('')}</table>`;
}

function layout(u, step) {
  const unsub = `${B.APP_URL}/api/verify-email?unsub=${B.unsubToken(u.id)}`;
  return `
  <div style="background:#f4f2fb;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden">
      <div style="height:6px;background:linear-gradient(135deg,#7c5cff,#c045e8,#ff5da2)"></div>
      <div style="padding:28px 28px 8px;color:#1a1a2e;font-size:15px;line-height:1.6">
        <div style="font-weight:900;font-size:20px;letter-spacing:.5px;color:#7c5cff;margin-bottom:18px">ÖZGERIS</div>
        ${step.body(u)}
        <div style="margin:22px 0 26px">
          <a href="${B.APP_URL}/?pay=1" style="display:inline-block;background:#7c5cff;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 26px;border-radius:12px">${step.cta}</a>
        </div>
        <p style="color:#555;margin:0 0 6px">Арман, ÖZGERIS</p>
      </div>
      <div style="padding:16px 28px 22px;color:#9a97a8;font-size:12px;line-height:1.5;border-top:1px solid #eeeaf7">
        Бұл хат ${esc(u.email)} мекенжайына ÖZGERIS-ке тіркелгенің үшін келді.
        <a href="${unsub}" style="color:#9a97a8">Хаттардан бас тарту</a>
      </div>
    </div>
  </div>`;
}

async function send(sendEmail, u, step) {
  const unsub = `${B.APP_URL}/api/verify-email?unsub=${B.unsubToken(u.id)}`;
  await sendEmail(u.email, step.subject(u), layout(u, step), { 'List-Unsubscribe': `<${unsub}>` });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runEmailFunnel() {
  if (!B.XP_KEY) return { skipped: 'billing disabled' };
  await B.ensureBillingSchema();
  const { sendEmail } = require('./_email'); // RESEND_API_KEY жоқ болса, push-ты құлатпай тек осы жерде қате береді
  let sent = 0;

  const renewals = await sql`
    select id, name, email, paid_until, renew_stage from users
    where paid_until is not null and not active and not mail_optout
      and paid_until > now() - interval '30 days'
      and (
        (renew_stage < 1 and paid_until > now() and paid_until <= now() + interval '3 days')
        or (renew_stage < 2 and paid_until <= now() and paid_until > now() - interval '3 days')
        or (renew_stage < 3 and paid_until <= now() - interval '5 days')
      )
    order by paid_until asc
    limit ${MAX_PER_RUN}
  `;
  for (const u of renewals) {
    const left = new Date(u.paid_until).getTime() - Date.now();
    const stage = left > 0 ? 1 : left > -3 * 86400000 ? 2 : 3;
    try {
      await send(sendEmail, u, RENEW[stage]);
    } catch (e) {
      console.error('renew email failed:', u.email, e.message);
      if (e.status === 429) return { sent, rateLimited: true };
      continue;
    }
    await sql`update users set renew_stage = ${stage} where id = ${u.id}`;
    sent++;
    await sleep(GAP_MS);
  }

  if (sent >= MAX_PER_RUN) return { sent };
  const leads = await sql`
    select id, name, email, funnel_stage, created_at from users
    where email_verified and not active and paid_until is null and not is_admin and not mail_optout
      and funnel_stage < ${SALES.length - 1}
      and (funnel_sent_at is null or funnel_sent_at < now() - interval '20 hours')
    order by created_at asc
    limit ${MAX_PER_RUN * 3}
  `;
  for (const u of leads) {
    if (sent >= MAX_PER_RUN) break;
    const stage = u.funnel_stage + 1;
    const ageH = (Date.now() - new Date(u.created_at).getTime()) / 3600000;
    if (ageH < SALES[stage].afterH) continue;
    try {
      await send(sendEmail, u, SALES[stage]);
    } catch (e) {
      console.error('funnel email failed:', u.email, e.message);
      if (e.status === 429) return { sent, rateLimited: true };
      continue;
    }
    await sql`update users set funnel_stage = ${stage}, funnel_sent_at = now() where id = ${u.id}`;
    sent++;
    await sleep(GAP_MS);
  }
  return { sent };
}

module.exports = { runEmailFunnel, SALES, RENEW, layout };
