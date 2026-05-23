// api/pipeline.js
// Vercel Serverless Function — Node.js 20
// Reads ISA Daily Activity records from Airtable
// Env vars required: AIRTABLE_TOKEN, AIRTABLE_BASE_ID

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN   = process.env.AIRTABLE_TOKEN;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLE   = 'ISA Daily Activity';

  if (!TOKEN || !BASE_ID) {
    return res.status(500).json({
      ok: false,
      error: 'AIRTABLE_TOKEN or AIRTABLE_BASE_ID not set in Vercel environment variables.'
    });
  }

  try {
    // Fetch records sorted by Activity Date descending, limit to last 30
    const url = new URL(
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`
    );
    url.searchParams.set('sort[0][field]',     'Activity Date');
    url.searchParams.set('sort[0][direction]', 'desc');
    url.searchParams.set('maxRecords',          '30');
    url.searchParams.set('view',               'Grid view');

    const airtableRes = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':  'application/json'
      }
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
        detail: parsed
      });
    }

    const records = (parsed.records || []).map(r => {
      const f = r.fields || {};
      return {
        id:              r.id,
        vaName:          f['VA Name']          || '',
        activityDate:    f['Activity Date']    || '',
        callsMade:       f['Calls Made']       || 0,
        conversations:   f['Conversations']    || 0,
        leadsContacted:  f['Leads Contacted']  || 0,
        appointmentsSet: f['Appointments Set'] || 0,
        followUps:       f['Follow Ups']       || 0,
        notesFromISA:    f['Notes From ISA']   || '',
        needsBriReview:  f['Needs Bri\'s Review'] || false,
        hotLeads:        f['Hot Leads']        || ''
      };
    });

    // Aggregate KPIs from all records (today + recent history)
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = records.filter(r => r.activityDate === today);
    const useRecords   = todayRecords.length ? todayRecords : records.slice(0, 5);

    const kpis = {
      callsMade:       useRecords.reduce((s, r) => s + Number(r.callsMade       || 0), 0),
      conversations:   useRecords.reduce((s, r) => s + Number(r.conversations   || 0), 0),
      leadsContacted:  useRecords.reduce((s, r) => s + Number(r.leadsContacted  || 0), 0),
      appointmentsSet: useRecords.reduce((s, r) => s + Number(r.appointmentsSet || 0), 0),
      followUps:       useRecords.reduce((s, r) => s + Number(r.followUps       || 0), 0)
    };

    // Items needing Bri's attention
    const needsAttention = records
      .filter(r => r.needsBriReview)
      .map(r => ({
        vaName:       r.vaName,
        activityDate: r.activityDate,
        notes:        r.notesFromISA,
        hotLeads:     r.hotLeads
      }));

    return res.status(200).json({
      ok:             true,
      records,
      kpis,
      needsAttention,
      todayCount:     todayRecords.length,
      lastUpdated:    new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({
      ok:     false,
      error:  'Failed to fetch from Airtable',
      detail: err.message
    });
  }
}
