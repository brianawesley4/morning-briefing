// api/planner.js — confirmed working version
// Field IDs and select option values verified live against Airtable.
//
// CONFIRMED working select values:
//   Tasks.Status:   "In Progress" | "Done" (NOT "To Do" — field is restricted)
//   Tasks.Priority: "High" | "Normal" | "Low" | "Urgent"
//   Events.Status:  "Confirmed" | "Done" (NOT "Scheduled" — doesn't exist)
//   Events.Type:    write without setting status — leave blank on create
//
// Required Vercel env var: AIRTABLE_TOKEN

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE  = 'appzePtOYiXoG4w1i';

  const TBL = {
    tasks:  'tblnTUNZA2tbF8wFa',
    events: 'tblJbXr2PBWyOnSnv',
    brief:  'tblBdxEaBg7qMVrF7'
  };

  // Confirmed field IDs from live Airtable schema
  const F = {
    // Tasks
    taskName:    'fldmxvEe8AOqgTUI6',
    taskPrio:    'fldtSCSjQ1Kz9xwXd',
    taskDue:     'fldR1AETsmkO1htWH',
    taskStatus:  'fldMPjBeXorhnmYjU',
    taskCat:     'fldIGBLJZ06ggEoQC',
    taskDetails: 'fld0elQxzqMiXI05G',
    taskCreated: 'fldRmCR9MSvjD0sTk',
    taskType:    'fldBANWxyGoqDUB54',
    // Events
    evtName:     'fldG2DsLPv0Be2ge1',
    evtDateTime: 'flduwxkpdDk7fxZNL',
    evtType:     'fld8AOX0uvvn8GixB',
    evtLocation: 'fldODWcPhyTKkjs6z',
    evtNotes:    'fldPSiVViZVUpr1qc',
    evtStatus:   'fldGb8AMekvKD2q2E',
    // Brief
    bfP1:        'fldkPycy7WuqZcbVL',
    bfP2:        'fldRIgDMaOLIbR4mT',
    bfP3:        'fldAQlLbktmHPFend',
    bfOpp:       'fldtlaYiALYLqd37F',
    bfRisk:      'fld8Ps6YpaTN04CsG',
    bfFocus:     'fldLPvyvJGN7C1VIg',
    bfAffirm:    'fld8S4B2USrSNgCka',
    bfReflect:   'fld2tRYX6VyTa8gPv',
    bfUpdated:   'fldV06XXNnl4P3G1x'
  };

  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: 'AIRTABLE_TOKEN not set in Vercel env vars.' });
  }

  const hdrs = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  const atFetch = async (url, opts = {}) => {
    const r    = await fetch(url, { headers: hdrs, ...opts });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 200) } }; }
    return { ok: r.ok, status: r.status, data };
  };

  // ══════════════ GET ══════════════
  if (req.method === 'GET') {
    const acceptsHtml = (req.headers?.accept || '').includes('text/html');
    if (acceptsHtml && !req.query?.type) {
      res.setHeader('Location', '/planner.html');
      return res.status(302).end();
    }

    const type = req.query?.type || 'tasks';

    try {
      if (type === 'tasks' || type === 'followups') {
        // Only filter on name — avoid filtering on Status since token may not see all options
        const params = new URLSearchParams({
          filterByFormula: `{${F.taskName}}!=''`,
          'sort[0][field]':     F.taskDue,
          'sort[0][direction]': 'asc',
          maxRecords: '200'
        });
        const { ok, data } = await atFetch(`https://api.airtable.com/v0/${BASE}/${TBL.tasks}?${params}`);
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Airtable read error' });

        const records = (data.records || [])
          .filter(r => (r.fields[F.taskName] || '').trim() !== '') // client-side blank guard
          .filter(r => (r.fields[F.taskStatus] || '') !== 'Done')  // hide done items
          .map(r => {
            const f = r.fields;
            const isFollowUp = (f[F.taskType] || '').toLowerCase().includes('follow');
            return {
              id:           r.id,
              airtableId:   r.id,
              name:         f[F.taskName]    || '',
              category:     f[F.taskCat]     || '',
              priority:     f[F.taskPrio]    || 'Normal',
              dueDate:      f[F.taskDue]     ? f[F.taskDue].split('T')[0] : '',
              notes:        f[F.taskDetails] || '',
              done:         (f[F.taskStatus] || '') === 'Done',
              isFollowUp,
              followUpDate: f[F.taskDue]     ? f[F.taskDue].split('T')[0] : '',
              createdAt:    r.createdTime
            };
          });
        return res.status(200).json({ ok: true, records, total: records.length });
      }

      if (type === 'events') {
        const params = new URLSearchParams({
          filterByFormula: `AND({${F.evtName}}!='',{${F.evtStatus}}!='Done')`,
          'sort[0][field]':     F.evtDateTime,
          'sort[0][direction]': 'asc',
          maxRecords: '200'
        });
        const { ok, data } = await atFetch(`https://api.airtable.com/v0/${BASE}/${TBL.events}?${params}`);
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Airtable read error' });

        const records = (data.records || [])
          .filter(r => (r.fields[F.evtName] || '').trim() !== '')
          .map(r => {
            const f  = r.fields;
            const dt = f[F.evtDateTime] || '';
            return {
              id:         r.id,
              airtableId: r.id,
              name:       f[F.evtName]     || '',
              type:       f[F.evtType]     || '',
              date:       dt ? dt.split('T')[0] : '',
              time:       dt ? dt.split('T')[1]?.slice(0, 5) : '',
              location:   f[F.evtLocation] || '',
              notes:      f[F.evtNotes]    || '',
              done:       (f[F.evtStatus]  || '') === 'Done',
              createdAt:  r.createdTime
            };
          });
        return res.status(200).json({ ok: true, records, total: records.length });
      }

      if (type === 'brief') {
        const params = new URLSearchParams({
          'sort[0][field]':     F.bfUpdated,
          'sort[0][direction]': 'desc',
          maxRecords: '1'
        });
        const { ok, data } = await atFetch(`https://api.airtable.com/v0/${BASE}/${TBL.brief}?${params}`);
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Airtable read error' });

        const records = (data.records || []).map(r => {
          const f = r.fields;
          return {
            id:          r.id,
            p1:          f[F.bfP1]      || '',
            p2:          f[F.bfP2]      || '',
            p3:          f[F.bfP3]      || '',
            opportunity: f[F.bfOpp]    || '',
            risk:        f[F.bfRisk]   || '',
            focus:       f[F.bfFocus]  || '',
            affirmation: f[F.bfAffirm] || '',
            reflection:  f[F.bfReflect]|| ''
          };
        });
        return res.status(200).json({ ok: true, records, total: records.length });
      }

      return res.status(400).json({ ok: false, error: `Unknown type: ${type}` });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ══════════════ POST ══════════════
  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON body' }); }

    const { type } = body || {};

    try {
      // ADD TASK
      if (type === 'task') {
        const { name, category, priority, dueDate, notes, isFollowUp } = body;
        if (!name?.trim()) return res.status(400).json({ ok: false, error: 'Task name is required.' });

        const fields = {
          [F.taskName]:    name.trim(),
          [F.taskCreated]: new Date().toISOString()
        };
        // Only set priority if it's a confirmed valid option
        const validPrios = ['Urgent', 'High', 'Normal', 'Low'];
        if (priority && validPrios.includes(priority)) fields[F.taskPrio] = priority;
        if (dueDate) fields[F.taskDue] = dueDate + 'T00:00:00.000Z';
        if (notes)   fields[F.taskDetails] = notes;
        // Don't set Status or Category on create — avoids rejected option errors

        const { ok, data } = await atFetch(
          `https://api.airtable.com/v0/${BASE}/${TBL.tasks}`,
          { method: 'POST', body: JSON.stringify({ fields }) }
        );
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Task write failed', raw: data });
        return res.status(200).json({ ok: true, id: data.id });
      }

      // ADD EVENT
      if (type === 'event') {
        const { name, eventType, date, time, location, notes } = body;
        if (!name?.trim()) return res.status(400).json({ ok: false, error: 'Event name is required.' });

        const fields = { [F.evtName]: name.trim() };
        if (date) {
          const t = time || '00:00';
          fields[F.evtDateTime] = `${date}T${t}:00.000Z`;
        }
        if (location) fields[F.evtLocation] = location;
        if (notes)    fields[F.evtNotes]    = notes;
        // Don't set Type or Status on create — avoids rejected select option errors

        const { ok, data } = await atFetch(
          `https://api.airtable.com/v0/${BASE}/${TBL.events}`,
          { method: 'POST', body: JSON.stringify({ fields }) }
        );
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Event write failed', raw: data });
        return res.status(200).json({ ok: true, id: data.id });
      }

      // SAVE BRIEF
      if (type === 'brief') {
        const { p1, p2, p3, opportunity, risk, focus, affirmation, reflection } = body;
        const fields = { [F.bfUpdated]: new Date().toISOString() };
        if (p1)          fields[F.bfP1]      = p1;
        if (p2)          fields[F.bfP2]      = p2;
        if (p3)          fields[F.bfP3]      = p3;
        if (opportunity) fields[F.bfOpp]     = opportunity;
        if (risk)        fields[F.bfRisk]    = risk;
        if (focus)       fields[F.bfFocus]   = focus;
        if (affirmation) fields[F.bfAffirm]  = affirmation;
        if (reflection)  fields[F.bfReflect] = reflection;

        const { ok, data } = await atFetch(
          `https://api.airtable.com/v0/${BASE}/${TBL.brief}`,
          { method: 'POST', body: JSON.stringify({ fields }) }
        );
        if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Brief write failed' });
        return res.status(200).json({ ok: true, id: data.id });
      }

      return res.status(400).json({ ok: false, error: `Unknown POST type: ${type}` });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ══════════════ PATCH — mark done ══════════════
  if (req.method === 'PATCH') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }

    const { recordId, recordType, done } = body || {};
    if (!recordId) return res.status(400).json({ ok: false, error: 'Missing recordId' });

    const isEvent = recordType === 'events';
    const tableId = isEvent ? TBL.events : TBL.tasks;
    const fldId   = isEvent ? F.evtStatus : F.taskStatus;
    // Use confirmed working status values
    const val     = done ? 'Done' : (isEvent ? 'Confirmed' : 'In Progress');

    try {
      const { ok, data } = await atFetch(
        `https://api.airtable.com/v0/${BASE}/${tableId}/${recordId}`,
        { method: 'PATCH', body: JSON.stringify({ fields: { [fldId]: val } }) }
      );
      if (!ok) return res.status(502).json({ ok: false, error: data?.error?.message || 'Update failed' });
      return res.status(200).json({ ok: true, id: data.id });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
