// Password-protected RSVP list for the dashboard at /admin.
// Env vars (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret!), ADMIN_PASSWORD
const crypto = require('crypto');

function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// Turns a failed Supabase response into a short, helpful message (this endpoint is password-protected).
async function dbMessage(r) {
  let t = '';
  try { t = await r.text(); const j = JSON.parse(t); t = [j.message, j.hint, j.code].filter(Boolean).join(' / ') || t; } catch (e) {}
  const tip = r.status === 404 ? ' Has supabase/rsvp.sql been run? Is SUPABASE_URL just the project URL (https://xxxx.supabase.co)?'
    : r.status === 401 || r.status === 403 ? ' Check SUPABASE_SERVICE_ROLE_KEY (must be the service_role key, not the anon key).' : '';
  return String(t).slice(0, 300) + tip;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // Trim stray spaces/newlines/quotes that often sneak in when pasting env vars.
  const clean = v => String(v || '').trim().replace(/^["']|["']$/g, '');
  const SUPABASE_URL = clean(process.env.SUPABASE_URL);
  const SUPABASE_SERVICE_ROLE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Dashboard is not configured (missing environment variables).' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (!body.password || !same(body.password, ADMIN_PASSWORD)) {
    await new Promise(r => setTimeout(r, 800)); // slow down guessing
    return res.status(401).json({ error: 'Wrong password.' });
  }
  // Legacy keys are JWTs (eyJ...) and go in both headers; new-style keys (sb_secret_...) are not JWTs and go in apikey only.
  const H = { apikey: SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')) H.Authorization = 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY;
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
      if (!r.ok) return res.status(502).json({ error: 'Database error (' + r.status + '): ' + (await dbMessage(r)) });
      const rows = await r.json();
      if (!rows.length) return res.status(404).json({ error: 'RSVP not found.' });
      return res.status(200).json({ row: rows[0] });
    } catch (e) {
      return res.status(502).json({ error: 'Could not reach the database.' });
    }
  }
  // Admin edit of a whole RSVP. The price, guest count and payment reference are recomputed here from the room_rates table.
  // { action:'update_rsvp', id, first, last, attending, stay, diet, message, guests:[{first,last,diet,room}] }  (guests[0] = the main guest)
  if (body.action === 'update_rsvp') {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(String(body.id || ''))) return res.status(400).json({ error: 'Bad id.' });
    const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const first = str(body.first, 80), last = str(body.last, 80);
    if (!first || !last) return res.status(400).json({ error: 'First and last name are required.' });
    const attending = body.attending === true;
    const patch = { first_name: first, last_name: last, attending, diet: str(body.diet, 600) || null, message: str(body.message, 1000) || null, updated_at: new Date().toISOString() };
    try {
      if (attending) {
        const stay = body.stay;
        if (stay !== 'both_nights' && stay !== 'friday_only') return res.status(400).json({ error: 'Choose which nights they are staying.' });
        const list = Array.isArray(body.guests) ? body.guests : [];
        if (list.length < 1 || list.length > 8) return res.status(400).json({ error: 'A booking needs between 1 and 8 guests.' });
        const rr = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/room_rates?select=*', { headers: H });
        if (!rr.ok) return res.status(502).json({ error: 'Database error (' + rr.status + '): ' + (await dbMessage(rr)) });
        const rates = Object.fromEntries((await rr.json()).map(x => [x.id, x]));
        const nights = stay === 'both_nights' ? 2 : 1;
        const byRoom = {}, extra = [];
        let total = 0;
        for (let i = 0; i < list.length; i++) {
          const g = list[i] || {}, room = rates[g.room];
          if (!room) return res.status(400).json({ error: 'Guest ' + (i + 1) + ' needs an accommodation.' });
          const name = i === 0 ? (first + ' ' + last) : (str(g.first, 80) + ' ' + str(g.last, 80)).trim();
          if (i > 0) {
            if (!str(g.first, 80) || !str(g.last, 80)) return res.status(400).json({ error: 'Guest ' + (i + 1) + ' needs a first and last name.' });
            extra.push({ first: str(g.first, 80), last: str(g.last, 80), diet: str(g.diet, 400) });
          }
          (byRoom[room.id] = byRoom[room.id] || []).push(name);
          total += room.rate * nights;
        }
        for (const [id, names] of Object.entries(byRoom)) {
          if (names.length > rates[id].capacity) return res.status(400).json({ error: rates[id].short + ' holds at most ' + rates[id].capacity + ' people (you put ' + names.length + ').' });
        }
        Object.assign(patch, {
          stay, guest_count: list.length, guests: extra, total_amount: total,
          accommodation: Object.entries(byRoom).map(([id, names]) => ({ id, people: names.length, names })),
          payment_reference: (first + ' ' + last).slice(0, 40) + ' - ' + Object.keys(byRoom).map(id => rates[id].short).join(', '),
        });
      } else {
        Object.assign(patch, { stay: null, guest_count: 1, guests: [], accommodation: [], total_amount: null, payment_reference: null });
      }
      const r = await fetch(base + '?id=eq.' + body.id, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      if (!r.ok) return res.status(502).json({ error: 'Database error (' + r.status + '): ' + (await dbMessage(r)) });
      const rows = await r.json();
      if (!rows.length) return res.status(404).json({ error: 'RSVP not found.' });
      return res.status(200).json({ row: rows[0] });
    } catch (e) {
      return res.status(502).json({ error: 'Could not reach the database: ' + (e && e.message ? e.message : e) });
    }
  }
  try {
    const r = await fetch(
      base + '?select=*&order=created_at.desc&limit=2000',
      { headers: H }
    );
    if (!r.ok) return res.status(502).json({ error: 'Database error (' + r.status + '): ' + (await dbMessage(r)) });
    return res.status(200).json({ rows: await r.json() });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the database: ' + (e && e.message ? e.message : e) + ' (check SUPABASE_URL).' });
  }
};
