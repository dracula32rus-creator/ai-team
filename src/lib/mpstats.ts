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

export function detectMarket(query: string): "wb" | "oz" | "both" {
  const t = query.toLowerCase();
  if (t.match(/\bwb\b|вб|вайлдберриз|wildberries/)) return "wb";
  if (t.match(/\boz\b|озон|ozon/)) return "oz";
  return "both";
}

export async function searchWbSubjects(keyword: string) {
  console.log("=== MPStats WB search:", keyword);
  const res = await fetch(`${WB_BASE}/subject/list`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ keyword, startRow: 0, endRow: 8 }),
  });
  const text = await res.text();
  console.log("WB subject/list status:", res.status, text.slice(0, 200));
  if (!res.ok) return [];
  try {
    const data = JSON.parse(text);
    return (data?.data ?? []).map((s: Record<string, unknown>) => ({
      id: s.id, name: s.name, market: "wb",
    }));
  } catch { return []; }
}

export async function searchOzNiches(keyword: string) {
  console.log("=== MPStats OZ search:", keyword);
  const res = await fetch(`${OZ_BASE}/niche/list?search=${encodeURIComponent(keyword)}&startRow=0&endRow=8`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({}),
  });
  const text = await res.text();
  console.log("OZ niche/list status:", res.status, text.slice(0, 200));
  if (!res.ok) return [];
  try {
    const data = JSON.parse(text);
    return (data?.data ?? []).map((s: Record<string, unknown>) => ({
      id: s.category_id, name: s.category, market: "oz",
    }));
  } catch { return []; }
}

export async function getWbNicheData(subjectId: number) {
  const { d1, d2 } = getDates();
  const h = getHeaders();
  const base = `${WB_BASE}/subject`;
  const q = `path=${subjectId}&d1=${d1}&d2=${d2}`;

  console.log("=== WB niche data for id:", subjectId, "period:", d1, d2);

  const [infoRes, sellersRes, brandsRes, priceRes, trendsRes] = await Promise.all([
    fetch(`${base}/${subjectId}`, { headers: h }),
    fetch(`${base}/sellers?${q}&startRow=0&endRow=10`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/brands?${q}&startRow=0&endRow=5`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/price_segmentation?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/trends?${q}&trends_by=week`, { method: "POST", headers: h, body: JSON.stringify({}) }),
  ]);

  const results = await Promise.all([
    infoRes.text(), sellersRes.text(), brandsRes.text(),
    priceRes.text(), trendsRes.text(),
  ]);

  console.log("WB sellers status:", sellersRes.status, results[1].slice(0, 150));
  console.log("WB price status:", priceRes.status, results[3].slice(0, 150));

  const parse = (text: string) => { try { return JSON.parse(text); } catch { return {}; } };
  const [info, sellers, brands, price, trends] = results.map(parse);

  return {
    market: "wb",
    info,
    sellers: sellers?.data ?? sellers ?? [],
    brands: brands?.data ?? brands ?? [],
    priceSegments: price?.data ?? price ?? [],
    trends: trends?.data ?? trends ?? [],
  };
}

export async function getOzNicheData(nicheId: number) {
  const { d1, d2 } = getDates();
  const h = getHeaders();
  const base = `${OZ_BASE}/niche`;
  const q = `path=${nicheId}&d1=${d1}&d2=${d2}`;

  const [infoRes, sellersRes, brandsRes, priceRes, trendsRes] = await Promise.all([
    fetch(`${base}/${nicheId}`, { headers: h }),
    fetch(`${base}/sellers?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/brands?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/price_segmentation?${q}&segmentsCnt=8`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/trends?${q}&trends_by=week`, { method: "POST", headers: h, body: JSON.stringify({}) }),
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
    trends: trends ?? [],
  };
}