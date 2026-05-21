export default async function handler(req, res) {
  try {
    const key = process.env.ANTHROPIC_API_KEY;

    if (!key) {
      return res.status(200).json({
        ok: false,
        error: "Missing ANTHROPIC_API_KEY"
      });
    }

    return res.status(200).json({
      ok: true,
      whatMattersMost: "Focus on revenue-producing conversations before admin work.",
      biggestOpportunity: "Your strongest opportunity today is turning warm leads into appointments.",
      biggestRisk: "Getting distracted by setup instead of follow-up.",
      moveForwardBy: "Complete your top 3 lead touches before noon.",
      priority1: "Call hot leads.",
      priority2: "Review pipeline and overdue follow-ups.",
      priority3: "Post one visibility piece today.",
      revenueAction: "Call the lead most likely to convert first.",
      reelIdea: "Film a quick market update: what buyers should know about rates this week.",
      captionPrompt: "The market is not perfect, but strategy beats waiting.",
      storyIdea: "Show your morning dashboard and your lead follow-up block.",
      leadMessage: "Hey! I was thinking about your home search and wanted to check in before the week gets away from us.",
      ratesTalkingPoint: "Rates matter, but seller credits and builder incentives can change the monthly payment conversation.",
      marketInsight: "Watch inventory, days on market, and builder incentives closely.",
      wealthMove: "Track pending commission and set aside taxes before spending.",
      teamPriority: "Your ISA should prioritize hot leads and overdue follow-ups first.",
      affirmation: "I am building with discipline, elegance, and intention.",
      closingLine: "Move like the woman you are becoming.",
      focusOn: ["Revenue conversations", "Pipeline movement"],
      moneyMoves: ["Hot lead calls", "Pending commission review"],
      ignoreToday: ["Busy work", "Over-editing content"],
      watchOut: ["Spending all day tweaking the dashboard"],
      delegate: ["CRM cleanup", "Basic follow-up reminders"],
      decideToday: ["Who needs a call instead of a text?"]
    });

  } catch (error) {
    return res.status(200).json({
      ok: false,
      error: error.message
    });
  }
}
