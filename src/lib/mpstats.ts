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
  console.log("=== MPStats WB search/subjects:", keyword);
  const { d1, d2 } = getDates();

  const res = await fetch(
    `${WB_BASE}/search/subjects?path=${encodeURIComponent(keyword)}&d1=${d1}&d2=${d2}`,
    { method: "POST", headers: getHeaders(), body: JSON.stringify({}) }
  );
  const text = await res.text();
  console.log("WB search/subjects status:", res.status, text.slice(0, 300));
  if (!res.ok) {
    console.log("WB search/subjects failed, trying items fallback...");
    return await searchWbSubjectsFallback(keyword);
  }

  try {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : (data?.data ?? []);
    if (!items.length) {
      console.log("WB search/subjects empty, trying items fallback...");
      return await searchWbSubjectsFallback(keyword);
    }
    console.log("WB search/subjects results:", items.slice(0, 3).map((s: Record<string, unknown>) => s.name));
    return items.slice(0, 5).map((s: Record<string, unknown>) => ({
      id: s.id, name: s.name, market: "wb",
    }));
  } catch {
    return await searchWbSubjectsFallback(keyword);
  }
}

async function searchWbSubjectsFallback(keyword: string) {
  console.log("=== MPStats WB fallback via items:", keyword);

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
    console.log("WB fallback found subject:", subjectId, subjectName);
    return [{ id: subjectId, name: subjectName, market: "wb" }];
  } catch { return []; }
}

export async function searchOzNiches(keyword: string) {
  console.log("=== MPStats OZ search:", keyword);
  const res = await fetch(`${OZ_BASE}/niche/list?search=${encodeURIComponent(keyword)}&startRow=0&endRow=50`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({}),
  });
  const text = await res.text();
  console.log("OZ niche/list status:", res.status, text.slice(0, 200));
  if (!res.ok) return [];
  try {
    const data = JSON.parse(text);
    const all = (data?.data ?? []) as Record<string, unknown>[];

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

    scored.sort((a, b) => b.score - a.score);
    const relevant = scored.filter(s => s.score > 0);
    const result = relevant.length > 0 ? relevant.slice(0, 5) : scored.slice(0, 5);

    console.log("OZ top results:", result.slice(0, 3).map(s => `${s.subject.category}(${s.score})`));

    return result.map(s => ({
      id: s.subject.category_id,
      name: s.subject.category,
      market: "oz",
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