module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== 'd1e9bf6e52ac59d926b2439c5a7aa52fb1fa3f9cba377aca') { res.status(401).json({error:'unauthorized'}); return; }
  const { to } = req.body || {};
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(200).json({ error: 'NO_RESEND_API_KEY' });
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'ÖZGERIS <noreply@ozgeris.asia>', to: [to || 'test@example.com'], subject: 'diag', html: '<p>diag</p>' }),
    });
    const text = await r.text();
    return res.status(200).json({ status: r.status, ok: r.ok, body: text });
  } catch (e) {
    return res.status(200).json({ caught: String(e) });
  }
};
