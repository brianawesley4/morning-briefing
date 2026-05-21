export default async function handler(req, res) {
  try {
    const key = process.env.NEWS_API_KEY;

    if (!key) {
      return res.status(500).json({
        ok: false,
        error: "Missing NEWS_API_KEY"
      });
    }

    const getNews = async (query) => {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${key}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "error") {
        throw new Error(data.message || "NewsAPI request failed");
      }

      return (data.articles || []).map(article => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source?.name
      }));
    };

    const [national, dfw, local, world, builders] = await Promise.all([
      getNews("real estate mortgage rates housing market"),
      getNews("Dallas Fort Worth real estate market"),
      getNews("Mansfield Arlington South Dallas development"),
      getNews("economy interest rates business consumer confidence"),
      getNews("home builders incentives Dallas Fort Worth")
    ]);

    return res.status(200).json({
      ok: true,
      national,
      dfw,
      local,
      world,
      builders
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
Sent from my iPhone
