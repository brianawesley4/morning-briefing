// api/planner.js
// Receives POST from the planner page and writes to Airtable
// Keeps AIRTABLE_TOKEN server-side — never exposed to the browser
//
// Required Vercel env var: AIRTABLE_TOKEN

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const TOKEN = process.env.AIRTABLE_TOKEN;
  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: 'AIRTABLE_TOKEN not set in Vercel environment variables.' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ ok: false, error: 'Invalid JSON body' }); }

  const { table, fields } = body || {};
  if (!table || !fields) {
    return res.status(400).json({ ok: false, error: 'Missing table or fields in request body' });
  }

  const BASE_ID = 'appzePtOYiXoG4w1i';

  // Remove undefined/empty fields before sending to Airtable
  const cleanFields = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

  try {
    const atRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${table}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ fields: cleanFields })
    });

    const raw = await atRes.text();
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ ok: false, error: 'Airtable returned invalid JSON', preview: raw.slice(0, 200) }); }

    if (!atRes.ok) {
      return res.status(502).json({
        ok:     false,
        error:  parsed.error?.message || 'Airtable write failed',
        status: atRes.status,
        detail: parsed
      });
    }

    return res.status(200).json({ ok: true, id: parsed.id });

  } catch (err) {
    return res.status(500).json({ ok: false, error: `Fetch failed: ${err.message}` });
  }
}
