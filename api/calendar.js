// api/calendar.js
// Reads Google Calendar for bri@estemrealtygroup.com
// Falls back to a diagnostic response (not fake hardcoded events) when OAuth not configured.
//
// Required Vercel env vars:
//   GCAL_CLIENT_ID      
//   GCAL_CLIENT_SECRET  
//   GCAL_REFRESH_TOKEN  
//
// Setup: see bottom of this file for exact steps.

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const CLIENT_ID     = process.env.GCAL_CLIENT_ID;
  const CLIENT_SECRET = process.env.GCAL_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GCAL_REFRESH_TOKEN;

  // ── OAuth not yet configured ─────────────────────────────────────
  // Return empty events with a clear setup message.
  // Dashboard will show "Calendar not connected" instead of wrong hardcoded data.
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return res.status(200).json({
      ok:           false,
      setupRequired: true,
      error:        'Google Calendar OAuth credentials not set in Vercel. Add GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_REFRESH_TOKEN to Vercel → Settings → Environment Variables.',
      events:       []
    });
  }

  try {
    // ── 1. Exchange refresh token for access token ─────────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type:    'refresh_token'
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(502).json({
        ok:     false,
        error:  'Google token exchange failed — GCAL_REFRESH_TOKEN may be expired or invalid.',
        detail: tokenData.error_description || tokenData.error || '',
        events: []
      });
    }

    const auth = `Bearer ${tokenData.access_token}`;

    // ── 2. Compute today's range in Chicago time ───────────────────
    // Use the Intl API so this is always correct regardless of server timezone
    const now        = new Date();
    const formatter  = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const todayLocal = formatter.format(now); // YYYY-MM-DD in Chicago time

    // Chicago is UTC-5 (CST) or UTC-6 (CDT) — use offset from the date string
    // Safest: use midnight–midnight in the Chicago-local date, expressed as ISO
    const timeMin = `${todayLocal}T00:00:00-06:00`; // CDT offset (May = CDT = UTC-5)
    const timeMax = `${todayLocal}T23:59:59-05:00`; // covers full day regardless of DST

    // ── 3. Fetch primary calendar events ──────────────────────────
    const params = new URLSearchParams({
      calendarId:   'primary',
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '25',
      timeZone:     'America/Chicago'
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: auth } }
    );

    if (!calRes.ok) {
      const errData = await calRes.json().catch(() => ({}));
      return res.status(502).json({
        ok:     false,
        error:  errData?.error?.message || `Google Calendar API returned HTTP ${calRes.status}`,
        events: []
      });
    }

    const calData   = await calRes.json();
    const rawEvents = (calData.items || []).filter(e => e.status !== 'cancelled');

    // ── 4. Shape into dashboard format ────────────────────────────
    const events = rawEvents.map(e => ({
      id:           e.id,
      summary:      e.summary || '(no title)',
      description:  (e.description || '').replace(/<[^>]*>/g, ''), // strip HTML
      location:     e.location || '',
      start:        e.start,
      end:          e.end,
      conferenceUrl: e.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri
                     || e.hangoutLink
                     || '',
      status:       e.status,
      allDay:       !!e.start?.date
    }));

    return res.status(200).json({
      ok:          true,
      date:        todayLocal,
      calendarId:  'bri@estemrealtygroup.com',
      count:       events.length,
      fetchedAt:   new Date().toISOString(),
      events
    });

  } catch (err) {
    return res.status(500).json({
      ok:     false,
      error:  `Calendar fetch threw an exception: ${err.message}`,
      events: []
    });
  }
}

/*
=================================================================
ONE-TIME GOOGLE CALENDAR OAUTH SETUP (takes about 5 minutes)
=================================================================

Step 1 — Google Cloud Console
  1. Go to console.cloud.google.com
  2. Select or create a project for Estem Realty
  3. APIs & Services → Enable APIs → search "Google Calendar API" → Enable
  4. APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID
  5. Application type: Web application
  6. Name: Estem Dashboard
  7. Authorized redirect URIs → Add: https://developers.google.com/oauthplayground
  8. Click Create → copy the Client ID and Client Secret

Step 2 — Get Refresh Token
  1. Go to: https://developers.google.com/oauthplayground
  2. Click the gear icon (⚙) in the top right
  3. Check "Use your own OAuth credentials"
  4. Paste your Client ID and Client Secret
  5. In the left panel, find and select:
       Google Calendar API v3 →
       https://www.googleapis.com/auth/calendar.readonly
  6. Click "Authorize APIs" → sign in as bri@estemrealtygroup.com
  7. Click "Exchange authorization code for tokens"
  8. Copy the "Refresh token" value

Step 3 — Add to Vercel
  Vercel → your project → Settings → Environment Variables → Add:
    GCAL_CLIENT_ID      = (your client ID from Step 1)
    GCAL_CLIENT_SECRET  = (your client secret from Step 1)
    GCAL_REFRESH_TOKEN  = (your refresh token from Step 2)
  
  Then: Vercel → Deployments → Redeploy (to pick up new env vars)

=================================================================
*/
