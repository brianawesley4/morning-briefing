// api/pipeline.js
// Source of truth: Estem CRM (estem-crm.vercel.app/api/leads)
// NO Airtable. NO FUB. NO ISA. Clean.
//
// Priority scoring framework:
//   is_revived=true              → score boost +40 (responded after dormancy)
//   grade A+ or A, notes exist  → score boost +30 (high grade + context)
//   stage = Past Client          → score boost +20 (referral/repeat)
//   notes contain pre-approv    → score boost +18 (financing ready)
//   grade A+ or A               → score boost +15 (high grade)
//   lcd > 365                   → score boost +10 (long neglect)
//   is_revived=false, grade B   → score boost +5  (warm pipeline)
//
// Total max: ~100 points above base CRM score

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const generatedAt = new Date().toISOString();

  try {
    // ── Fetch all leads from Estem CRM ──────────────────────────
    let leads;
    try {
      const crmRes = await fetch('https://estem-crm.vercel.app/api/leads', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (!crmRes.ok) {
        return res.status(502).json({
          ok: false,
          error: `CRM returned HTTP ${crmRes.status}`,
          meta: { generatedAt, source: 'estem-crm' }
        });
      }
      leads = await crmRes.json();
    } catch (fetchErr) {
      return res.status(502).json({
        ok: false,
        error: 'CRM is temporarily unavailable',
        meta: { generatedAt, source: 'estem-crm' }
      });
    }

    if (!Array.isArray(leads)) {
      return res.status(502).json({
        ok: false,
        error: 'CRM returned unexpected data format',
        meta: { generatedAt }
      });
    }

    const active = leads.filter(l => !l.is_archived);

    // ── Priority scoring ─────────────────────────────────────────
    function priorityScore(lead) {
      let s = 0;
      const notes  = (lead.notes || '').toLowerCase();
      const grade  = lead.grade || '';
      const lcd    = Number(lead.lcd) || 0;
      const stage  = lead.stage || '';

      if (lead.is_revived)                          s += 40; // responded after dormancy
      if (['A+','A'].includes(grade) && lead.notes) s += 30; // high grade + context exists
      if (stage === 'Past Client')                  s += 20; // referral / repeat source
      if (notes.includes('pre-approv'))             s += 18; // financing confirmed
      if (['A+','A'].includes(grade))               s += 15; // high grade alone
      if (lcd > 365)                                s += 10; // dangerously neglected
      if (!['A+','A'].includes(grade) && grade === 'B') s += 5; // warm pipeline
      return s;
    }

    function whySurfaced(lead) {
      const notes = (lead.notes || '').toLowerCase();
      const lcd   = Number(lead.lcd) || 0;
      if (lead.is_revived)
        return `Responded after dormancy — highest close potential.`;
      if (notes.includes('pre-approv'))
        return `Pre-approval noted — financing confirmed. ${lcd}d since last contact.`;
      if (lead.stage === 'Hot')
        return 'Active hot lead — follow up immediately.';
      if (lead.stage === 'Past Client')
        return `Past client — referral and repeat opportunity. ${lcd}d since last contact.`;
      if (['A+','A'].includes(lead.grade) && lead.notes)
        return `Grade ${lead.grade} with context notes. ${lcd}d since last contact — neglect risk.`;
      if (['A+','A'].includes(lead.grade))
        return `Grade ${lead.grade} — ${lcd}d since last contact.`;
      return `Grade ${lead.grade} — ${lcd}d since last contact.`;
    }

    // ── People Requiring Action (top 8 by priority score) ────────
    const hotLeadsList = active
      .filter(l => {
        const grade = l.grade || '';
        return (
          l.is_revived ||
          ['A+', 'A'].includes(grade) ||
          l.stage === 'Hot' ||
          l.stage === 'Past Client'
        );
      })
      .map(l => ({
        ...l,
        _priority: priorityScore(l),
        _why: whySurfaced(l)
      }))
      .sort((a, b) => b._priority - a._priority)
      .slice(0, 8)
      .map(l => ({
        id:               l.id,
        name:             l.name,
        stage:            l.stage,
        grade:            l.grade,
        score:            l.score,
        priorityScore:    l._priority,
        why:              l._why,
        phone:            l.phone,
        email:            l.email,
        notes:            l.notes,
        tags:             l.tags,
        daysSinceContact: l.lcd,
        source:           l.source,
        type:             l.type,
        is_revived:       l.is_revived,
        updated_at:       l.updated_at
      }));

    // ── Overdue contacts (A/A+/B, lcd >= 90) ─────────────────────
    const overdueList = active
      .filter(l => ['A+','A','B'].includes(l.grade || '') && (Number(l.lcd) || 0) >= 90)
      .sort((a, b) => (Number(b.lcd) || 0) - (Number(a.lcd) || 0))
      .slice(0, 10)
      .map(l => ({
        name:             l.name,
        stage:            l.stage,
        grade:            l.grade,
        daysSinceContact: l.lcd,
        phone:            l.phone,
        notes:            (l.notes || '').slice(0, 100)
      }));

    // ── Pipeline counts ───────────────────────────────────────────
    const buyers      = active.filter(l => (l.type || '').includes('Buyer')).length;
    const sellers     = active.filter(l => (l.type || '').includes('Seller')).length;
    const sphere      = active.filter(l => l.stage === 'Sphere').length;
    const referrals   = active.filter(l => l.stage === 'Referral').length;
    const pastClients = active.filter(l => l.stage === 'Past Client').length;
    const highGrade   = active.filter(l => ['A+','A'].includes(l.grade || '')).length;
    const hot         = active.filter(l => l.stage === 'Hot').length;
    const revived     = active.filter(l => l.is_revived === true).length;
    const overdueCount = active.filter(l =>
      ['A+','A','B'].includes(l.grade || '') && (Number(l.lcd) || 0) >= 90
    ).length;
    const newToday = active.filter(l => {
      if (!l.created_at) return false;
      const d = new Date(l.created_at);
      return d.toDateString() === new Date().toDateString();
    }).length;

    // ── What changed in last 24h ──────────────────────────────────
    const cutoff24h = new Date(Date.now() - 86400 * 1000);
    const changedRecently = active
      .filter(l => l.updated_at && new Date(l.updated_at) > cutoff24h)
      .map(l => ({
        id:         l.id,
        name:       l.name,
        stage:      l.stage,
        grade:      l.grade,
        updated_at: l.updated_at,
        is_revived: l.is_revived
      }));

    // ── CRM context string for AI brief ──────────────────────────
    const topLead = hotLeadsList[0];
    const crmContext = [
      `Total active leads: ${active.length}`,
      `Grade A+/A: ${highGrade} leads (${overdueCount} not contacted in 90+ days)`,
      `Revived leads awaiting follow-up: ${revived}`,
      `Buyers: ${buyers} | Sellers: ${sellers} | Sphere: ${sphere} | Referrals: ${referrals}`,
      `Past Clients: ${pastClients}`,
      topLead ? `Top priority contact: ${topLead.name} (${topLead.why})` : 'No high-priority contacts',
      changedRecently.length ? `Updated in last 24h: ${changedRecently.length} records` : 'No records updated in last 24h'
    ].join(' | ');

    return res.status(200).json({
      ok: true,
      pipeline: {
        totalActive:   active.length,
        buyers,
        sellers,
        sphere,
        referrals,
        pastClients,
        highGrade,
        hot,
        revived,
        overdue:       overdueCount,
        newToday
      },
      hotLeadsList,
      overdueList,
      changedRecently,
      crmContext,
      meta: {
        generatedAt,
        source:       'estem-crm.vercel.app',
        totalLeads:   leads.length,
        activeLeads:  active.length
      }
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'Pipeline calculation failed',
      meta: { generatedAt }
    });
  }
}
