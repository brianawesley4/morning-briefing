// api/planner.js — definitive version
// Uses confirmed Airtable field IDs to prevent write errors.
// GET: reads tasks/events/brief
// POST: creates records
// PATCH: marks done/undone
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
  const BASE    = 'appzePtOYiXoG4w1i';

  // ── Confirmed table IDs ───────────────────────────────
  const TBL = {
    tasks:  'tblnTUNZA2tbF8wFa',
    events: 'tblJbXr2PBWyOnSnv',
    brief:  'tblBdxEaBg7qMVrF7'
  };

  // ── Confirmed field IDs ───────────────────────────────
  // Tasks table
  const TASK = {
    name:       'fldmxvEe8AOqgTUI6', // Task Name (singleLineText) PRIMARY
    priority:   'fldtSCSjQ1Kz9xwXd', // Priority (singleSelect: Urgent/High/Normal/Low)
    dueDate:    'fldR1AETsmkO1htWH', // Due Date (dateTime)
    status:     'fldMPjBeXorhnmYjU', // Status (singleSelect: To Do/In Progress/Done)
    category:   'fldIGBLJZ06ggEoQC', // Category (singleSelect: Revenue/Client/Personal/School/Admin/Follow-Up/Delegate)
    details:    'fld0elQxzqMiXI05G', // Task Details (multilineText)
    createdDate:'fldRmCR9MSvjD0sTk', // Created Date (dateTime)
    taskType:   'fldBANWxyGoqDUB54'  // Task Type (singleSelect: Standard/Follow-Up)
  };

  // Calendar Events table
  const EVT = {
    name:    'fldG2DsLPv0Be2ge1', // Event Name (singleLineText) PRIMARY
    dateTime:'flduwxkpdDk7fxZNL', // Date/Time (dateTime)
    type:    'fld8AOX0uvvn8GixB', // Type (singleSelect: Client Showing/Listing Appt/Team Meeting/Personal/School/Call)
    location:'fldODWcPhyTKkjs6z', // Location (singleLineText)
    notes:   'fldPSiVViZVUpr1qc', // Event Notes (multilineText)
    status:  'fldGb8AMekvKD2q2E'  // Event Status (singleSelect: Scheduled/Done/Cancelled)
  };

  // Daily Brief table
  const BRIEF = {
    p1:          'fldkPycy7WuqZcbVL',
    p2:          'fldRIgDMaOLIbR4mT',
    p3:          'fldAQlLbktmHPFend',
    opportunity: 'fldtlaYiALYLqd37F',
    risk:        'fld8Ps6YpaTN04CsG',
    focus:       'fldLPvyvJGN7C1VIg',
    affirmation: 'fld8S4B2USrSNgCka',
    reflection:  'fld2tRYX6VyTa8gPv',
    lastUpdated: 'fldV06XXNnl4P3G1x'
  };

  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: 'AIRTABLE_TOKEN not set in Vercel env vars.' });
  }

  const hdrs = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type':  'application/json'
  };

  const atFetch = async (url, opts = {}) => {
    const r    = await fetch(url, { headers: hdrs, ...opts });
    const text = await r.text();
    const data = JSON.parse(text);
    return { ok: r.ok, status: r.status, data };
  };

  // ══════════════════════════════════════════
  //  GET — read records
  // ══════════════════════════════════════════
  if (req.method === 'GET') {
    // Redirect browser bookmarks to the planner page
    const acceptsHtml = (req.headers?.accept || '').includes('text/html');
    if (acceptsHtml && !req.query?.type) {
      res.setHeader('Location', '/planner.html');
      return res.status(302).end();
    }

    const type = req.query?.type || 'tasks';

    try {
      // TASKS
      if (type === 'tasks' || type === 'followups') {
        const params = new URLSearchParams({
          filterByFormula: `AND({${TASK.name}}!='',OR({${TASK.status}}='To Do',{${TASK.status}}='In Progress',{${TASK.status}}=''))`,
          'sort[0][field]':     TASK.dueDate,
          'sort[0][direction]': 'asc',
          maxRecords: '200'
        });
        const { ok, data } = await atFetch(`https://api.airtable.com/v0/${BASE}/${TBL.tasks}?${params}`);
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Airtable error' });

        const records = (data.records || []).map(r => {
          const f          = r.fields || {};
          const isFollowUp = (f[TASK.taskType] || '').toLowerCase() === 'follow-up'
                          || (f[TASK.category]  || '').toLowerCase() === 'follow-up';
          return {
            id:           r.id,
            airtableId:   r.id,
            name:         f[TASK.name]        || '',
            category:     f[TASK.category]    || 'Admin',
            priority:     f[TASK.priority]    || 'Normal',
            dueDate:      f[TASK.dueDate]     ? f[TASK.dueDate].split('T')[0] : '',
            notes:        f[TASK.details]     || '',
            done:         f[TASK.status]      === 'Done',
            isFollowUp,
            followUpDate: f[TASK.dueDate]     ? f[TASK.dueDate].split('T')[0] : '',
            createdAt:    r.createdTime
          };
        });
        return res.status(200).json({ ok: true, records, total: records.length });
      }

      // EVENTS
      if (type === 'events') {
        const params = new URLSearchParams({
          filterByFormula: `AND({${EVT.name}}!='',OR({${EVT.status}}='Scheduled',{${EVT.status}}=''))`,
          'sort[0][field]':     EVT.dateTime,
          'sort[0][direction]': 'asc',
          maxRecords: '200'
        });
        const { ok, data } = await atFetch(`https://api.airtable.com/v0/${BASE}/${TBL.events}?${params}`);
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Airtable error' });

        const records = (data.records || []).map(r => {
          const f = r.fields || {};
          const dt = f[EVT.dateTime] || '';
          return {
            id:         r.id,
            airtableId: r.id,
            name:       f[EVT.name]     || '',
            type:       f[EVT.type]     || 'Personal',
            date:       dt ? dt.split('T')[0] : '',
            time:       dt ? dt.split('T')[1]?.slice(0, 5) : '',
            location:   f[EVT.location] || '',
            notes:      f[EVT.notes]    || '',
            done:       f[EVT.status]   === 'Done',
            createdAt:  r.createdTime
          };
        });
        return res.status(200).json({ ok: true, records, total: records.length });
      }

      // BRIEF
      if (type === 'brief') {
        const params = new URLSearchParams({
          'sort[0][field]':     BRIEF.lastUpdated,
          'sort[0][direction]': 'desc',
          maxRecords: '1'
        });
        const { ok, data } = await atFetch(`https://api.airtable.com/v0/${BASE}/${TBL.brief}?${params}`);
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Airtable error' });

        const records = (data.records || []).map(r => {
          const f = r.fields || {};
          return {
            id:          r.id,
            p1:          f[BRIEF.p1]          || '',
            p2:          f[BRIEF.p2]          || '',
            p3:          f[BRIEF.p3]          || '',
            opportunity: f[BRIEF.opportunity] || '',
            risk:        f[BRIEF.risk]        || '',
            focus:       f[BRIEF.focus]       || '',
            affirmation: f[BRIEF.affirmation] || '',
            reflection:  f[BRIEF.reflection]  || ''
          };
        });
        return res.status(200).json({ ok: true, records, total: records.length });
      }

      return res.status(400).json({ ok: false, error: `Unknown type: ${type}` });

    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ══════════════════════════════════════════
  //  POST — create record
  // ══════════════════════════════════════════
  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON body' }); }

    const { type, name, category, priority, dueDate, notes, isFollowUp,
            eventType, date, time, location,
            p1, p2, p3, opportunity, risk, focus, affirmation, reflection } = body || {};

    try {
      // ── Add Task ───────────────────────────────────────
      if (type === 'task') {
        if (!name?.trim()) return res.status(400).json({ ok: false, error: 'Task name is required.' });

        const fields = {
          [TASK.name]:        name.trim(),
          [TASK.status]:      'To Do',
          [TASK.createdDate]: new Date().toISOString()
        };
        if (priority)  fields[TASK.priority] = priority;
        if (category)  fields[TASK.category] = category;
        if (dueDate)   fields[TASK.dueDate]  = dueDate + 'T00:00:00.000Z';
        if (notes)     fields[TASK.details]  = notes;
        if (isFollowUp) fields[TASK.taskType] = 'Follow-Up';

        const { ok, data } = await atFetch(
          `https://api.airtable.com/v0/${BASE}/${TBL.tasks}`,
          { method: 'POST', body: JSON.stringify({ fields }) }
        );
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Airtable write failed', detail: data });
        return res.status(200).json({ ok: true, id: data.id });
      }

      // ── Add Event ──────────────────────────────────────
      if (type === 'event') {
        if (!name?.trim()) return res.status(400).json({ ok: false, error: 'Event name is required.' });

        const fields = {
          [EVT.name]:   name.trim(),
          [EVT.status]: 'Scheduled'
        };

        // Build ISO dateTime
        if (date) {
          const timeStr = time || '00:00';
          fields[EVT.dateTime] = `${date}T${timeStr}:00.000Z`;
        }

        // Map frontend type values to Airtable singleSelect options
        const typeMap = {
          'Client Showing': 'Client Showing',
          'Listing Appt':   'Listing Appt',
          'Team Meeting':   'Team Meeting',
          'Personal':       'Personal',
          'School':         'School',
          'Call':           'Call'
        };
        if (eventType) fields[EVT.type] = typeMap[eventType] || 'Personal';
        if (location)  fields[EVT.location] = location;
        if (notes)     fields[EVT.notes]    = notes;

        const { ok, data } = await atFetch(
          `https://api.airtable.com/v0/${BASE}/${TBL.events}`,
          { method: 'POST', body: JSON.stringify({ fields }) }
        );
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Airtable write failed', detail: data });
        return res.status(200).json({ ok: true, id: data.id });
      }

      // ── Save Brief ─────────────────────────────────────
      if (type === 'brief') {
        const fields = { [BRIEF.lastUpdated]: new Date().toISOString() };
        if (p1)          fields[BRIEF.p1]          = p1;
        if (p2)          fields[BRIEF.p2]          = p2;
        if (p3)          fields[BRIEF.p3]          = p3;
        if (opportunity) fields[BRIEF.opportunity] = opportunity;
        if (risk)        fields[BRIEF.risk]        = risk;
        if (focus)       fields[BRIEF.focus]       = focus;
        if (affirmation) fields[BRIEF.affirmation] = affirmation;
        if (reflection)  fields[BRIEF.reflection]  = reflection;

        const { ok, data } = await atFetch(
          `https://api.airtable.com/v0/${BASE}/${TBL.brief}`,
          { method: 'POST', body: JSON.stringify({ fields }) }
        );
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Brief save failed', detail: data });
        return res.status(200).json({ ok: true, id: data.id });
      }

      return res.status(400).json({ ok: false, error: `Unknown POST type: ${type}` });

    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ══════════════════════════════════════════
  //  PATCH — mark done / undone
  // ══════════════════════════════════════════
  if (req.method === 'PATCH') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }

    const { recordId, recordType, done } = body || {};
    if (!recordId) return res.status(400).json({ ok: false, error: 'Missing recordId' });

    const isEvent    = recordType === 'events';
    const tableId    = isEvent ? TBL.events : TBL.tasks;
    const statusFld  = isEvent ? EVT.status : TASK.status;
    const statusVal  = done ? 'Done' : 'To Do';

    try {
      const { ok, data } = await atFetch(
        `https://api.airtable.com/v0/${BASE}/${tableId}/${recordId}`,
        { method: 'PATCH', body: JSON.stringify({ fields: { [statusFld]: statusVal } }) }
      );
      if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Update failed' });
      return res.status(200).json({ ok: true, id: data.id });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
