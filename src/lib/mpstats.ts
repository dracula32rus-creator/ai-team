const WB_BASE = "https://mpstats.io/api/analytics/v1/wb";
const OZ_BASE = "https://mpstats.io/api/analytics/v1/oz";

function getHeaders() {
  return {
    "X-Mpstats-TOKEN": process.env.MPSTATS_TOKEN!,
    "Content-Type": "application/json",
  };
}

// 1 месяц
function getDates1m() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const d2 = yesterday.toISOString().split("T")[0];
  const d1 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { d1, d2 };
}

// 3 месяца
function getDates3m() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const d2 = yesterday.toISOString().split("T")[0];
  const d1 = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { d1, d2 };
}

// 12 месяцев
function getDates12m() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const d2 = yesterday.toISOString().split("T")[0];
  const d1 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { d1, d2 };
}

// 4 года для тренда
function getYearDates() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const d2 = yesterday.toISOString().split("T")[0];
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 4);
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
    method: "POST", headers: getHeaders(), body: JSON.stringify({}),
  });
  const itemsText = await itemsRes.text();
  console.log("WB items status:", itemsRes.status, itemsText.slice(0, 200));
  if (!itemsRes.ok) return [];
  let firstItemId: number | null = null;
  try { const d = JSON.parse(itemsText); firstItemId = d?.data?.[0]?.id ?? null; } catch { return []; }
  if (!firstItemId) return [];
  const itemRes = await fetch(`${WB_BASE}/items/${firstItemId}/full`, { headers: getHeaders() });
  const itemText = await itemRes.text();
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
  console.log("=== MPStats OZ search via niche/list:", keyword);
  const batchSize = 500;
  let bestMatch: Record<string, unknown> | null = null;
  let bestScore = 0;
  const keywordLower = keyword.toLowerCase();
  const keywords = keywordLower.split(/\s+/).filter(w => w.length > 2);
  for (let startRow = 0; startRow < 5000; startRow += batchSize) {
    const res = await fetch(`${OZ_BASE}/niche/list`, {
      method: "POST", headers: getHeaders(),
      body: JSON.stringify({ startRow, endRow: startRow + batchSize }),
    });
    const text = await res.text();
    console.log(`OZ batch ${startRow}-${startRow + batchSize} status:`, res.status);
    if (!res.ok) break;
    try {
      const data = JSON.parse(text);
      const batch = (data?.data ?? []) as Record<string, unknown>[];
      for (const s of batch) {
        const name = String(s.category ?? "").toLowerCase();
        let score = 0;
        if (name === keywordLower) score += 100;
        else if (name.includes(keywordLower)) score += 50;
        else if (keywordLower.includes(name)) score += 30;
        for (const kw of keywords) { if (name.includes(kw)) score += 10; }
        if (score > 0) { const depth = (name.match(/\//g) || []).length; score += Math.max(0, 4 - depth) * 5; }
        if (score > bestScore) { bestScore = score; bestMatch = s; }
      }
      if (bestScore >= 50) { console.log("OZ found match at batch", startRow, ":", bestMatch?.category, "(", bestScore, ")"); break; }
      if (batch.length < batchSize) break;
    } catch { break; }
  }
  if (!bestMatch || bestScore === 0) { console.log("OZ no match for:", keyword); return []; }
  const fullName = String(bestMatch.category ?? "");
  const shortName = fullName.split("/").pop()?.trim() || fullName;
  console.log("OZ best match:", fullName, "→ short:", shortName);
  return [{ id: bestMatch.id, name: shortName, market: "oz" }];
}

// Вспомогательная функция для загрузки данных за конкретный период
async function fetchWbPeriodData(subjectId: number, d1: string, d2: string, h: Record<string, string>) {
  const base = `${WB_BASE}/subject`;
  const q = `path=${subjectId}&d1=${d1}&d2=${d2}`;
  const [sellersRes, brandsRes, priceRes] = await Promise.all([
    fetch(`${base}/sellers?${q}&startRow=0&endRow=10`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/brands?${q}&startRow=0&endRow=10`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/price_segmentation?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
  ]);
  const [sellersText, brandsText, priceText] = await Promise.all([
    sellersRes.text(), brandsRes.text(), priceRes.text(),
  ]);
  const parse = (text: string) => { try { return JSON.parse(text); } catch { return {}; } };
  const [sellers, brands, price] = [sellersText, brandsText, priceText].map(parse);
  return {
    sellers: sellers?.data ?? sellers ?? [],
    brands: brands?.data ?? brands ?? [],
    priceSegments: price?.data ?? price ?? [],
    period: { d1, d2 },
  };
}

async function fetchOzPeriodData(nicheId: number, d1: string, d2: string, h: Record<string, string>) {
  const base = `${OZ_BASE}/niche`;
  const q = `path=${nicheId}&d1=${d1}&d2=${d2}`;
  const [sellersRes, brandsRes, priceRes] = await Promise.all([
    fetch(`${base}/sellers?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/brands?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/price_segmentation?${q}&segmentsCnt=8`, { method: "POST", headers: h, body: JSON.stringify({}) }),
  ]);
  const [sellersText, brandsText, priceText] = await Promise.all([
    sellersRes.text(), brandsRes.text(), priceRes.text(),
  ]);
  const parse = (text: string) => { try { return JSON.parse(text); } catch { return {}; } };
  const [sellers, brands, price] = [sellersText, brandsText, priceText].map(parse);
  return {
    sellers: sellers?.data ?? sellers ?? [],
    brands: brands?.data ?? brands ?? [],
    priceSegments: price?.data ?? price ?? [],
    period: { d1, d2 },
  };
}

export type PeriodData = {
  sellers: Record<string, unknown>[];
  brands: Record<string, unknown>[];
  priceSegments: Record<string, unknown>[];
  period: { d1: string; d2: string };
};

export type NicheDataMultiPeriod = {
  market: string;
  info: Record<string, unknown>;
  trends: Record<string, unknown>[];
  period1m: PeriodData;
  period3m: PeriodData;
  period12m: PeriodData;
};

export async function getWbNicheData(subjectId: number): Promise<NicheDataMultiPeriod> {
  const { d1: d1year, d2: d2year } = getYearDates();
  const dates1m = getDates1m();
  const dates3m = getDates3m();
  const dates12m = getDates12m();
  const h = getHeaders();
  const base = `${WB_BASE}/subject`;
  const qTrend = `path=${subjectId}&d1=${d1year}&d2=${d2year}&trends_by=month`;

  console.log("=== WB niche data for id:", subjectId, "loading 3 periods...");

  const [infoRes, trendsRes, data1m, data3m, data12m] = await Promise.all([
    fetch(`${base}/${subjectId}`, { headers: h }),
    fetch(`${base}/trends?${qTrend}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetchWbPeriodData(subjectId, dates1m.d1, dates1m.d2, h),
    fetchWbPeriodData(subjectId, dates3m.d1, dates3m.d2, h),
    fetchWbPeriodData(subjectId, dates12m.d1, dates12m.d2, h),
  ]);

  const [infoText, trendsText] = await Promise.all([infoRes.text(), trendsRes.text()]);
  const parse = (text: string) => { try { return JSON.parse(text); } catch { return {}; } };
  const info = parse(infoText);
  const trendsRaw = parse(trendsText);
  const trends = Array.isArray(trendsRaw) ? trendsRaw : (trendsRaw?.data ?? []);

  console.log("WB trends status:", trendsRes.status, "points:", trends.length);

  return { market: "wb", info, trends, period1m: data1m, period3m: data3m, period12m: data12m };
}

export async function getOzNicheData(nicheId: number): Promise<NicheDataMultiPeriod> {
  const { d1: d1year, d2: d2year } = getYearDates();
  const dates1m = getDates1m();
  const dates3m = getDates3m();
  const dates12m = getDates12m();
  const h = getHeaders();
  const base = `${OZ_BASE}/niche`;
  const qTrend = `path=${nicheId}&d1=${d1year}&d2=${d2year}&trends_by=month`;

  const [infoRes, trendsRes, data1m, data3m, data12m] = await Promise.all([
    fetch(`${base}/${nicheId}`, { headers: h }),
    fetch(`${base}/trends?${qTrend}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetchOzPeriodData(nicheId, dates1m.d1, dates1m.d2, h),
    fetchOzPeriodData(nicheId, dates3m.d1, dates3m.d2, h),
    fetchOzPeriodData(nicheId, dates12m.d1, dates12m.d2, h),
  ]);

  const [infoText, trendsText] = await Promise.all([infoRes.text(), trendsRes.text()]);
  const parse = (text: string) => { try { return JSON.parse(text); } catch { return {}; } };
  const info = parse(infoText);
  const trendsRaw = parse(trendsText);
  const trends = Array.isArray(trendsRaw) ? trendsRaw : (trendsRaw?.data ?? []);

  return { market: "oz", info, trends, period1m: data1m, period3m: data3m, period12m: data12m };
}