if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY env var орнатылмаған (Vercel Project Settings → Environment Variables)');
}
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'ÖZGERIS <onboarding@resend.dev>';

async function sendVerificationEmail(to, code) {
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:420px;margin:0 auto;color:#1a1a2e">
      <h2 style="color:#7c5cff;margin:0 0 16px">ÖZGERIS</h2>
      <p style="font-size:15px">Тіркелуді растау коды:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:10px;margin:18px 0;color:#1a1a2e">${code}</div>
      <p style="color:#888;font-size:13px;line-height:1.6">Код 15 минут бойы жарамды. Бұл сұранысты өзің жасамаған болсаң, хатты елемей-ақ қой.</p>
    </div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: `ÖZGERIS — растау коды: ${code}`, html }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('Email жіберілмеді: ' + t);
  }
}

module.exports = { sendVerificationEmail };
