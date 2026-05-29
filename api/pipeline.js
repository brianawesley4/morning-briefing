// api/pipeline.js
// Reads ISA Daily Activity from Airtable.
// Hardcoded base + table IDs — no env var needed for these.
// Required env var: AIRTABLE_TOKEN

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN    = process.env.AIRTABLE_TOKEN;
  const BASE_ID  = 'appzePtOYiXoG4w1i';
  const TABLE_ID = 'tblQloWBA4xVtcBbv'; // ISA Daily Activity

  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: 'AIRTABLE_TOKEN not set in Vercel env vars.' });
  }

  try {
    const params = new URLSearchParams({
      // Only return records with a real VA Name — no blanks
      filterByFormula: "AND({VA Name}!='',{Activity Date}!='')",
      'sort[0][field]':     'Activity Date',
      'sort[0][direction]': 'desc',
      maxRecords: '10'
    });

    const atRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    if (!atRes.ok) {
      const err = await atRes.json().catch(() => ({}));
      return res.status(502).json({ ok: false, error: err?.error?.message || `Airtable ${atRes.status}` });
    }

    const data    = await atRes.json();
    const records = (data.records || []).map(r => {
      const f = r.fields || {};
      return {
        id:              r.id,
        vaName:          f['VA Name']             || '',
        activityDate:    f['Activity Date']        || '',
        callsMade:       Number(f['Calls Made'])   || 0,
        conversations:   Number(f['Conversations'])|| 0,
        leadsContacted:  Number(f['Leads Contacted']) || 0,
        appointmentsSet: Number(f['Appointments Set'])|| 0,
        followUps:       Number(f['Follow Ups'])   || 0,
        notesFromISA:    f['Notes From ISA']       || '',
        needsBriReview:  f["Needs Bri's Review"]  === true,
        hotLeads:        f['Hot Leads']            === true
      };
    });

    // KPIs from the most recent real record
    const latest = records[0] || {};
    const kpis   = {
      callsMade:       latest.callsMade,
      conversations:   latest.conversations,
      leadsContacted:  latest.leadsContacted,
      appointmentsSet: latest.appointmentsSet,
      followUps:       latest.followUps
    };

    const needsAttention = records
      .filter(r => r.needsBriReview || r.hotLeads)
      .map(r => ({
        vaName:       r.vaName,
        activityDate: r.activityDate,
        notes:        r.notesFromISA,
        isHotLead:    r.hotLeads
      }));

    return res.status(200).json({
      ok: true,
      records,
      kpis,
      needsAttention,
      lastUpdated: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
