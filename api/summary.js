export default async function handler(req, res) {
  try {
    const key = process.env.ANTHROPIC_API_KEY;

    if (!key) {
      return res.status(500).json({
        ok: false,
        error: "Missing ANTHROPIC_API_KEY"
      });
    }

    const { ratesContext, newsContext } = req.body || {};

    const prompt = `
You are an elite executive AI strategist for a luxury real estate entrepreneur in Dallas-Fort Worth.

Based on the following market information:

RATES:
${ratesContext}

NEWS:
${newsContext}

Return ONLY valid JSON with:
{
  "whatMattersMost":"",
  "biggestOpportunity":"",
  "biggestRisk":"",
  "moveForwardBy":"",
  "priority1":"",
  "priority2":"",
  "priority3":"",
  "revenueAction":"",
  "reelIdea":"",
  "captionPrompt":"",
  "storyIdea":"",
  "leadMessage":"",
  "ratesTalkingPoint":"",
  "marketInsight":"",
  "wealthMove":"",
  "teamPriority":"",
  "affirmation":"",
  "closingLine":"",
  "focusOn":["",""],
  "moneyMoves":["",""],
  "ignoreToday":["",""],
  "watchOut":["",""],
  "delegate":["",""],
  "decideToday":["",""]
}
`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await response.json();

    const text = data.content?.[0]?.text || "{}";

    const parsed = JSON.parse(text);

    return res.status(200).json(parsed);

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
