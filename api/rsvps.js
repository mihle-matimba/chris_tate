// Password-protected RSVP list for the dashboard at /admin.
// Env vars (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret!), ADMIN_PASSWORD
const crypto = require('crypto');

function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Dashboard is not configured (missing environment variables).' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (!body.password || !same(body.password, ADMIN_PASSWORD)) {
    await new Promise(r => setTimeout(r, 800)); // slow down guessing
    return res.status(401).json({ error: 'Wrong password.' });
  }
  const H = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  const base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rsvps';
  // Mark an RSVP paid / unpaid: { action:'set_paid', id, paid, amount?, note? }
  if (body.action === 'set_paid') {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(String(body.id || ''))) return res.status(400).json({ error: 'Bad id.' });
    const paid = body.paid === true;
    const amount = paid && Number.isFinite(Number(body.amount)) && Number(body.amount) >= 0 ? Math.round(Number(body.amount)) : null;
    try {
      const r = await fetch(base + '?id=eq.' + body.id, {
        method: 'PATCH',
        headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({ paid, paid_amount: paid ? amount : null, paid_at: paid ? new Date().toISOString() : null, pay_note: paid ? String(body.note || '').slice(0, 300) || null : null }),
      });
      if (!r.ok) return res.status(502).json({ error: 'Database error (' + r.status + ').' });
      const rows = await r.json();
      if (!rows.length) return res.status(404).json({ error: 'RSVP not found.' });
      return res.status(200).json({ row: rows[0] });
    } catch (e) {
      return res.status(502).json({ error: 'Could not reach the database.' });
    }
  }
  try {
    const r = await fetch(
      base + '?select=*&order=created_at.desc&limit=2000',
      { headers: H }
    );
    if (!r.ok) return res.status(502).json({ error: 'Database error (' + r.status + ').' });
    return res.status(200).json({ rows: await r.json() });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the database.' });
  }
};
