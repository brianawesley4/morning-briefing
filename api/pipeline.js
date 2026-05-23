// api/pipeline.js
// Reads ISA Daily Activity from Airtable — Executive Command Center
// Base ID and Table ID are hardcoded (confirmed live from Airtable)
// Only requires: AIRTABLE_TOKEN env variable in Vercel

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.AIRTABLE_TOKEN;

  if (!TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'AIRTABLE_TOKEN is not set in Vercel environment variables.',
      fix: 'Go to Vercel → Settings → Environment Variables → add AIRTABLE_TOKEN'
    });
  }

  // Confirmed IDs from your live Airtable base — no env variable needed
  const BASE_ID  = 'appzePtOYiXoG4w1i';
  const TABLE_ID = 'tblQloWBA4xVtcBbv';  // ISA Daily Activity

  try {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('sort[0][field]',     'Activity Date');
    url.searchParams.set('sort[0][direction]', 'desc');
    url.searchParams.set('maxRecords',         '30');

    const airtableRes = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });

    const raw = await airtableRes.text();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      return res.status(502).json({
        ok: false,
        error: 'Airtable returned invalid JSON',
        preview: raw.slice(0, 200)
      });
    }

    if (!airtableRes.ok) {
      return res.status(502).json({
        ok: false,
        error: parsed.error?.message || 'Airtable request failed',
        airtableStatus: airtableRes.status,
        detail: parsed
      });
    }

    // Map records — field names match your confirmed Airtable schema
    const records = (parsed.records || []).map(r => {
      const f = r.fields || {};
      return {
        id:              r.id,
        vaName:          f['VA Name']             || '',
        activityDate:    f['Activity Date']        || '',
        callsMade:       Number(f['Calls Made'])   || 0,
        conversations:   Number(f['Conversations'])|| 0,
        leadsContacted:  Number(f['Leads Contacted']) || 0,
        appointmentsSet: Number(f['Appointments Set']) || 0,
        followUps:       Number(f['Follow Ups'])   || 0,
        notesFromISA:    f['Notes From ISA']       || '',
        needsBriReview:  f["Needs Bri's Review"]  === true,
        hotLeads:        f['Hot Leads']            === true
      };
    });

    // Aggregate KPIs — prefer today's records, fall back to most recent
    const today = new Date().toISOString().split('T')[0];
    const todayRecords  = records.filter(r => r.activityDate === today);
    const sourceRecords = todayRecords.length ? todayRecords : records.slice(0, 5);

    const kpis = {
      callsMade:       sourceRecords.reduce((s, r) => s + r.callsMade,       0),
      conversations:   sourceRecords.reduce((s, r) => s + r.conversations,   0),
      leadsContacted:  sourceRecords.reduce((s, r) => s + r.leadsContacted,  0),
      appointmentsSet: sourceRecords.reduce((s, r) => s + r.appointmentsSet, 0),
      followUps:       sourceRecords.reduce((s, r) => s + r.followUps,       0)
    };

    // Records flagged for Bri's attention
    const needsAttention = records
      .filter(r => r.needsBriReview || r.hotLeads)
      .map(r => ({
        vaName:       r.vaName,
        activityDate: r.activityDate,
        notes:        r.notesFromISA,
        isHotLead:    r.hotLeads
      }));

    return res.status(200).json({
      ok:             true,
      records,
      kpis,
      needsAttention,
      todayCount:     todayRecords.length,
      totalRecords:   records.length,
      lastUpdated:    new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({
      ok:     false,
      error:  'Fetch to Airtable failed',
      detail: err.message
    });
  }
}
