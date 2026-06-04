const WB_BASE = "https://mpstats.io/api/analytics/v1/wb";
const OZ_BASE = "https://mpstats.io/api/analytics/v1/oz";

function getHeaders() {
  return {
    "X-Mpstats-TOKEN": process.env.MPSTATS_TOKEN!,
    "Content-Type": "application/json",
  };
}

function getDates() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const d2 = yesterday.toISOString().split("T")[0];
  const d1 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { d1, d2 };
}

function getYearDates() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const d2 = yesterday.toISOString().split("T")[0];
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 4); // ← было -1, теперь 4 года
  yearAgo.setDate(1);
  const d1 = yearAgo.toISOString().split("T")[0];
  return { d1, d2 };
}

export function detectMarket(query: string): "wb" | "oz" | "both" {
  const t = query.toLowerCase();
  if (t.match(/\bwb\b|вб|вайлдберриз|wildberries/)) return "wb";
  if (t.match(/\boz\b|озон|ozon/)) return "oz";
  return "both";
}

export async function searchWbSubjects(keyword: string) {
  console.log("=== MPStats WB search via items:", keyword);

  const itemsRes = await fetch(`${WB_BASE}/items?keyword=${encodeURIComponent(keyword)}&startRow=0&endRow=5`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({}),
  });
  const itemsText = await itemsRes.text();
  console.log("WB items status:", itemsRes.status, itemsText.slice(0, 200));
  if (!itemsRes.ok) return [];

  let firstItemId: number | null = null;
  try {
    const itemsData = JSON.parse(itemsText);
    firstItemId = itemsData?.data?.[0]?.id ?? null;
  } catch { return []; }

  if (!firstItemId) return [];

  const itemRes = await fetch(`${WB_BASE}/items/${firstItemId}/full`, {
    headers: getHeaders(),
  });
  const itemText = await itemRes.text();
  console.log("WB item full status:", itemRes.status);
  if (!itemRes.ok) return [];

  try {
    const item = JSON.parse(itemText);
    const subjectId = item?.subject?.id;
    const subjectName = item?.subject?.name;
    if (!subjectId) return [];
    console.log("WB found subject:", subjectId, subjectName);
    return [{ id: subjectId, name: subjectName, market: "wb" }];
  } catch { return []; }
}

export async function searchOzNiches(keyword: string) {
  console.log("=== MPStats OZ search via niche/list full scan:", keyword);

  // Качаем батчами по 500 (MPStats лимит)
  const all: Record<string, unknown>[] = [];
  const batchSize = 500;
  for (let startRow = 0; startRow < 5000; startRow += batchSize) {
    const res = await fetch(`${OZ_BASE}/niche/list`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ startRow, endRow: startRow + batchSize }),
    });
    const text = await res.text();
    console.log(`OZ niche/list batch ${startRow}-${startRow + batchSize} status:`, res.status);
    if (!res.ok) break;
    try {
      const data = JSON.parse(text);
      const batch = (data?.data ?? []) as Record<string, unknown>[];
      all.push(...batch);
      if (batch.length < batchSize) break; // последняя страница
    } catch { break; }
  }
  console.log("OZ total niches loaded:", all.length);

  try {

    const keywordLower = keyword.toLowerCase();
    const keywords = keywordLower.split(/\s+/).filter(w => w.length > 2);

    const scored = all.map((s) => {
      const name = String(s.category ?? "").toLowerCase();
      let score = 0;
      if (name === keywordLower) score += 100;
      else if (name.includes(keywordLower)) score += 50;
      else if (keywordLower.includes(name)) score += 30;
      for (const kw of keywords) {
        if (name.includes(kw)) score += 10;
      }
      return { subject: s, score };
    });

    const relevant = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
    console.log("OZ relevant niches:", relevant.slice(0, 3).map(s => `${s.subject.category}(${s.score})`));

    if (relevant.length === 0) return [];

    return relevant.slice(0, 3).map(s => ({
      id: s.subject.id,
      name: s.subject.category,
      market: "oz",
    }));
  } catch { return []; }
}

export async function getWbNicheData(subjectId: number) {
  const { d1, d2 } = getDates();
  const { d1: d1year, d2: d2year } = getYearDates();
  const h = getHeaders();
  const base = `${WB_BASE}/subject`;
  const q = `path=${subjectId}&d1=${d1}&d2=${d2}`;
  const qTrend = `path=${subjectId}&d1=${d1year}&d2=${d2year}&trends_by=month`;

  console.log("=== WB niche data for id:", subjectId, "period:", d1, d2);

  const [infoRes, sellersRes, brandsRes, priceRes, trendsRes] = await Promise.all([
    fetch(`${base}/${subjectId}`, { headers: h }),
    fetch(`${base}/sellers?${q}&startRow=0&endRow=10`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/brands?${q}&startRow=0&endRow=5`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/price_segmentation?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/trends?${qTrend}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
  ]);

  const results = await Promise.all([
    infoRes.text(), sellersRes.text(), brandsRes.text(),
    priceRes.text(), trendsRes.text(),
  ]);

  console.log("WB sellers status:", sellersRes.status, results[1].slice(0, 150));
  console.log("WB price status:", priceRes.status, results[3].slice(0, 150));
  console.log("WB trends status:", trendsRes.status, results[4].slice(0, 150));

  const parse = (text: string) => { try { return JSON.parse(text); } catch { return {}; } };
  const [info, sellers, brands, price, trends] = results.map(parse);

  return {
    market: "wb",
    info,
    sellers: sellers?.data ?? sellers ?? [],
    brands: brands?.data ?? brands ?? [],
    priceSegments: price?.data ?? price ?? [],
    trends: Array.isArray(trends) ? trends : (trends?.data ?? []),
  };
}

export async function getOzNicheData(nicheId: number) {
  const { d1, d2 } = getDates();
  const { d1: d1year, d2: d2year } = getYearDates();
  const h = getHeaders();
  const base = `${OZ_BASE}/niche`;
  const q = `path=${nicheId}&d1=${d1}&d2=${d2}`;
  const qTrend = `path=${nicheId}&d1=${d1year}&d2=${d2year}&trends_by=month`;

  const [infoRes, sellersRes, brandsRes, priceRes, trendsRes] = await Promise.all([
    fetch(`${base}/${nicheId}`, { headers: h }),
    fetch(`${base}/sellers?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/brands?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/price_segmentation?${q}&segmentsCnt=8`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/trends?${qTrend}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
  ]);

  const results = await Promise.all([
    infoRes.text(), sellersRes.text(), brandsRes.text(),
    priceRes.text(), trendsRes.text(),
  ]);

  const parse = (text: string) => { try { return JSON.parse(text); } catch { return {}; } };
  const [info, sellers, brands, price, trends] = results.map(parse);

  return {
    market: "oz",
    info,
    sellers: sellers?.data ?? sellers ?? [],
    brands: brands?.data ?? brands ?? [],
    priceSegments: price?.data ?? price ?? [],
    trends: Array.isArray(trends) ? trends : (trends?.data ?? []),
  };
}