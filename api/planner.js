// api/planner.js
// Handles both GET (read from Airtable) and POST (write to Airtable)
// so the planner syncs across all devices.
//
// Required Vercel env var: AIRTABLE_TOKEN

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN   = process.env.AIRTABLE_TOKEN;
  const BASE_ID = 'appzePtOYiXoG4w1i';

  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: 'AIRTABLE_TOKEN not set in Vercel env vars.' });
  }

  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type':  'application/json'
  };

  // ── Table IDs ────────────────────────────────────────────────────
  const TABLES = {
    tasks:   'tblnTUNZA2tbF8wFa',
    events:  'tblJbXr2PBWyOnSnv',
    brief:   'tblBdxEaBg7qMVrF7'
  };

  // ════════════════════════════════════════
  //  GET — read records for the planner
  // ════════════════════════════════════════
  if (req.method === 'GET') {
    const type = req.query?.type || 'tasks';
    const tableId = TABLES[type];
    if (!tableId) return res.status(400).json({ ok: false, error: `Unknown type: ${type}` });

    try {
      // Build sort + filter based on type
      let params = new URLSearchParams({ maxRecords: '100' });

      if (type === 'tasks' || type === 'followups') {
        // Tasks sorted by due date, filter out completed
        params.set('sort[0][field]',     'Due Date');
        params.set('sort[0][direction]', 'asc');
        // Include both To Do and In Progress
        params.set('filterByFormula', "OR({Status}='To Do',{Status}='In Progress',{Status}='')");
      } else if (type === 'events') {
        params.set('sort[0][field]',     'Date/Time');
        params.set('sort[0][direction]', 'asc');
        params.set('filterByFormula', "OR({Event Status}='Scheduled',{Event Status}='')");
      } else if (type === 'brief') {
        params.set('sort[0][field]',     'Last Updated');
        params.set('sort[0][direction]', 'desc');
        params.set('maxRecords', '1');
      }

      const atRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`,
        { headers }
      );

      const raw = await atRes.text();
      let data;
      try { data = JSON.parse(raw); }
      catch { return res.status(502).json({ ok: false, error: 'Airtable returned invalid JSON' }); }

      if (!atRes.ok) {
        return res.status(502).json({ ok: false, error: data?.error?.message || `Airtable ${atRes.status}` });
      }

      // Shape records into planner format
      const records = (data.records || []).map(r => {
        const f = r.fields || {};

        if (type === 'events') {
          return {
            id:        r.id,
            airtableId:r.id,
            name:      f['Event Name']    || '',
            type:      f['Type']          || 'Personal',
            date:      f['Date/Time']     ? f['Date/Time'].split('T')[0] : '',
            time:      f['Date/Time']     ? f['Date/Time'].split('T')[1]?.slice(0,5) : '',
            location:  f['Location']      || '',
            notes:     f['Event Notes']   || '',
            done:      f['Event Status']  === 'Done',
            createdAt: r.createdTime
          };
        }

        if (type === 'brief') {
          return {
            id:          r.id,
            p1:          f['Top Priority 1']    || '',
            p2:          f['Top Priority 2']    || '',
            p3:          f['Top Priority 3']    || '',
            opportunity: f['Biggest Opportunity']|| '',
            risk:        f['Biggest Risk']      || '',
            focus:       f['Focus Reminder']    || '',
            affirmation: f['Affirmation']       || '',
            reflection:  f['Evening Reflection']|| '',
            updatedAt:   f['Last Updated']      || ''
          };
        }

        // tasks + follow-ups both live in Tasks table
        const isFollowUp = (f['Task Type'] || '').toLowerCase() === 'follow-up'
                        || (f['Category']  || '').toLowerCase() === 'follow-up';
        return {
          id:           r.id,
          airtableId:   r.id,
          name:         f['Task Name']    || '',
          category:     f['Category']     || 'Admin',
          priority:     f['Priority']     || 'Normal',
          dueDate:      f['Due Date']     ? f['Due Date'].split('T')[0] : '',
          assignedTo:   '', // linked record — skip for display
          notes:        f['Task Details'] || '',
          done:         (f['Status'] || '') === 'Done',
          isFollowUp,
          // follow-up extras
          method:       '',
          followUpDate: f['Due Date']     ? f['Due Date'].split('T')[0] : '',
          createdAt:    r.createdTime
        };
      });

      return res.status(200).json({ ok: true, records, total: records.length });

    } catch (err) {
      return res.status(500).json({ ok: false, error: `GET failed: ${err.message}` });
    }
  }

  // ════════════════════════════════════════
  //  PATCH — mark record done/undone
  // ════════════════════════════════════════
  if (req.method === 'PATCH') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }

    const { recordId, type, done } = body || {};
    if (!recordId || !type) return res.status(400).json({ ok: false, error: 'Missing recordId or type' });

    const tableId = TABLES[type === 'events' ? 'events' : 'tasks'];
    const statusField = type === 'events' ? 'Event Status' : 'Status';
    const statusValue = done ? 'Done' : 'To Do';

    try {
      const atRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, {
        method:  'PATCH',
        headers,
        body:    JSON.stringify({ fields: { [statusField]: statusValue } })
      });
      const data = await atRes.json();
      if (!atRes.ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Update failed' });
      return res.status(200).json({ ok: true, id: data.id });
    } catch (err) {
      return res.status(500).json({ ok: false, error: `PATCH failed: ${err.message}` });
    }
  }

  // ════════════════════════════════════════
  //  POST — create new record
  // ════════════════════════════════════════
  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON body' }); }

    const { table, fields } = body || {};
    if (!table || !fields) return res.status(400).json({ ok: false, error: 'Missing table or fields' });

    // Remove blank fields
    const clean = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    try {
      const atRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${table}`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ fields: clean })
      });

      const raw = await atRes.text();
      let data;
      try { data = JSON.parse(raw); }
      catch { return res.status(502).json({ ok: false, error: 'Airtable invalid JSON', preview: raw.slice(0,200) }); }

      if (!atRes.ok) {
        return res.status(502).json({ ok: false, error: data?.error?.message || 'Write failed', detail: data });
      }
      return res.status(200).json({ ok: true, id: data.id });

    } catch (err) {
      return res.status(500).json({ ok: false, error: `POST failed: ${err.message}` });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
