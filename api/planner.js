// api/planner.js
// GET  — reads tasks/events/brief from Airtable
// POST — creates new record in Airtable
// PATCH — marks record done/undone in Airtable
//
// Hardcoded base ID. Required env var: AIRTABLE_TOKEN

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN   = process.env.AIRTABLE_TOKEN;
  const BASE_ID = 'appzePtOYiXoG4w1i';

  const TABLES = {
    tasks:  'tblnTUNZA2tbF8wFa',
    events: 'tblJbXr2PBWyOnSnv',
    brief:  'tblBdxEaBg7qMVrF7'
  };

  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: 'AIRTABLE_TOKEN not set in Vercel env vars.' });
  }

  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type':  'application/json'
  };

  // ── GET ──────────────────────────────────────────────
  if (req.method === 'GET') {
    // Redirect browser bookmarks to the planner page
    const acceptsHtml = (req.headers?.accept || '').includes('text/html');
    if (acceptsHtml && !req.query?.type) {
      res.setHeader('Location', '/planner.html');
      return res.status(302).end();
    }

    const type    = req.query?.type || 'tasks';
    const tableId = TABLES[type === 'followups' ? 'tasks' : type];
    if (!tableId) return res.status(400).json({ ok: false, error: `Unknown type: ${type}` });

    const params = new URLSearchParams({ maxRecords: '100' });

    if (type === 'tasks' || type === 'followups') {
      // CRITICAL: filter out blank records at the Airtable level
      params.set('filterByFormula',
        "AND({Task Name}!='',OR({Status}='To Do',{Status}='In Progress',{Status}=''))");
      params.set('sort[0][field]',     'Due Date');
      params.set('sort[0][direction]', 'asc');
    } else if (type === 'events') {
      // CRITICAL: filter out blank records at the Airtable level
      params.set('filterByFormula',
        "AND({Event Name}!='',OR({Event Status}='Scheduled',{Event Status}=''))");
      params.set('sort[0][field]',     'Date/Time');
      params.set('sort[0][direction]', 'asc');
    } else if (type === 'brief') {
      params.set('sort[0][field]',     'Last Updated');
      params.set('sort[0][direction]', 'desc');
      params.set('maxRecords',         '1');
    }

    try {
      const atRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`,
        { headers }
      );
      const data = await atRes.json();
      if (!atRes.ok) return res.status(502).json({ ok: false, error: data?.error?.message || `Airtable ${atRes.status}` });

      const records = (data.records || []).map(r => {
        const f = r.fields || {};

        if (type === 'events') {
          return {
            id:         r.id,
            airtableId: r.id,
            name:       f['Event Name']   || '',
            type:       f['Type']         || 'Personal',
            date:       f['Date/Time']    ? f['Date/Time'].split('T')[0] : '',
            time:       f['Date/Time']    ? f['Date/Time'].split('T')[1]?.slice(0, 5) : '',
            location:   f['Location']     || '',
            notes:      f['Event Notes']  || '',
            done:       f['Event Status'] === 'Done',
            createdAt:  r.createdTime
          };
        }
        if (type === 'brief') {
          return {
            id:          r.id,
            p1:          f['Top Priority 1']     || '',
            p2:          f['Top Priority 2']     || '',
            p3:          f['Top Priority 3']     || '',
            opportunity: f['Biggest Opportunity']|| '',
            risk:        f['Biggest Risk']       || '',
            focus:       f['Focus Reminder']     || '',
            affirmation: f['Affirmation']        || '',
            reflection:  f['Evening Reflection'] || '',
            updatedAt:   f['Last Updated']       || ''
          };
        }
        // tasks + followups
        const isFollowUp = (f['Task Type'] || '').toLowerCase() === 'follow-up'
                        || (f['Category']  || '').toLowerCase() === 'follow-up';
        return {
          id:           r.id,
          airtableId:   r.id,
          name:         f['Task Name']    || '',
          category:     f['Category']     || 'Admin',
          priority:     f['Priority']     || 'Normal',
          dueDate:      f['Due Date']     ? f['Due Date'].split('T')[0] : '',
          assignedTo:   '',
          notes:        f['Task Details'] || '',
          done:         f['Status']       === 'Done',
          isFollowUp,
          method:       '',
          followUpDate: f['Due Date']     ? f['Due Date'].split('T')[0] : '',
          createdAt:    r.createdTime
        };
      });

      return res.status(200).json({ ok: true, records, total: records.length });

    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ── PATCH — mark done/undone ─────────────────────────
  if (req.method === 'PATCH') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }

    const { recordId, type, done } = body || {};
    if (!recordId) return res.status(400).json({ ok: false, error: 'Missing recordId' });

    const tableId     = type === 'events' ? TABLES.events : TABLES.tasks;
    const statusField = type === 'events' ? 'Event Status' : 'Status';
    const statusValue = done ? 'Done' : 'To Do';

    try {
      const atRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`,
        { method: 'PATCH', headers, body: JSON.stringify({ fields: { [statusField]: statusValue } }) }
      );
      const data = await atRes.json();
      if (!atRes.ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Update failed' });
      return res.status(200).json({ ok: true, id: data.id });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ── POST — create record ─────────────────────────────
  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }

    const { table, fields } = body || {};
    if (!table || !fields) return res.status(400).json({ ok: false, error: 'Missing table or fields' });

    // Strip blank fields — prevents ghost records
    const clean = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    // Require a name field — hard block against blank records
    const nameField = clean['Task Name'] || clean['Event Name'];
    if (!nameField || !nameField.trim()) {
      return res.status(400).json({ ok: false, error: 'Name field is required and cannot be blank.' });
    }

    try {
      const atRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${table}`,
        { method: 'POST', headers, body: JSON.stringify({ fields: clean }) }
      );
      const data = await atRes.json();
      if (!atRes.ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Write failed' });
      return res.status(200).json({ ok: true, id: data.id });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
