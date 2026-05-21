export default async function handler(req, res) {
  try {
    const key = process.env.FRED_API_KEY;

    if (!key) {
      return res.status(500).json({
        ok: false,
        error: "Missing FRED_API_KEY"
      });
    }

    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key=${key}&file_type=json&sort_order=desc&limit=2`;

    const response = await fetch(url);
    const data = await response.json();

    const latest = data.observations?.[0]?.value;
    const previous = data.observations?.[1]?.value;

    return res.status(200).json({
      ok: true,
      thirtyYear: {
        rate: latest,
        change: latest && previous
          ? Number(latest) - Number(previous)
          : 0,
        direction:
          latest > previous
            ? "up"
            : latest < previous
            ? "down"
            : "flat"
      },
      fifteenYear: {
        rate: "6.10",
        change: 0,
        direction: "flat"
      },
      fha: {
        rate: latest
          ? (Number(latest) - 0.3).toFixed(2)
          : "N/A"
      },
      va: {
        rate: latest
          ? (Number(latest) - 0.4).toFixed(2)
          : "N/A"
      }
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
