import { NextRequest, NextResponse } from "next/server";

const WB_BASE = "https://mpstats.io/api/analytics/v1/wb";
const OZ_BASE = "https://mpstats.io/api/analytics/v1/oz";

function getHeaders() {
  return {
    "X-Mpstats-TOKEN": process.env.MPSTATS_TOKEN!,
    "Content-Type": "application/json",
  };
}

function getDates() {
  const d2 = new Date().toISOString().split("T")[0];
  const d1 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { d1, d2 };
}

function detectMarket(query: string): "wb" | "oz" | "both" {
  const t = query.toLowerCase();
  if (t.match(/\bwb\b|вб|вайлдберриз|wildberries/)) return "wb";
  if (t.match(/\boz\b|озон|ozon/)) return "oz";
  return "both";
}

export async function searchWbSubjects(keyword: string) {
  console.log("=== MPStats WB search:", keyword);
  console.log("Token:", process.env.MPSTATS_TOKEN?.slice(0, 8) + "...");

  const res = await fetch(`${WB_BASE}/subjects`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ keyword, startRow: 0, endRow: 8 }),
  });

  const text = await res.text();
  console.log("WB subjects status:", res.status);
  console.log("WB subjects response:", text.slice(0, 300));

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
  console.log("OZ niches status:", res.status);
  console.log("OZ niches response:", text.slice(0, 300));

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

  const [infoRes, trendsRes, priceRes, sellersRes, brandsRes] = await Promise.all([
    fetch(`${WB_BASE}/subject/${subjectId}?d1=${d1}&d2=${d2}`, { headers: h }),
    fetch(`${WB_BASE}/subject/${subjectId}/trends`, { method: "POST", headers: h, body: JSON.stringify({ d1, d2 }) }),
    fetch(`${WB_BASE}/subject/${subjectId}/price_segments`, { method: "POST", headers: h, body: JSON.stringify({ d1, d2 }) }),
    fetch(`${WB_BASE}/subject/${subjectId}/sellers`, { method: "POST", headers: h, body: JSON.stringify({ d1, d2, startRow: 0, endRow: 10 }) }),
    fetch(`${WB_BASE}/subject/${subjectId}/brands`, { method: "POST", headers: h, body: JSON.stringify({ d1, d2, startRow: 0, endRow: 5 }) }),
  ]);

  const [info, trends, price, sellers, brands] = await Promise.all([
    infoRes.json(), trendsRes.json(), priceRes.json(), sellersRes.json(), brandsRes.json(),
  ]);

  return {
    market: "wb", info,
    trends: trends?.data ?? trends,
    priceSegments: price?.data ?? price,
    sellers: sellers?.data ?? sellers,
    brands: brands?.data ?? brands,
  };
}

export async function getOzNicheData(nicheId: number) {
  const { d1, d2 } = getDates();
  const h = getHeaders();

  const [infoRes, trendsRes, priceRes, sellersRes, brandsRes] = await Promise.all([
    fetch(`${OZ_BASE}/niche/${nicheId}`, { headers: h }),
    fetch(`${OZ_BASE}/niche/trends?path=${nicheId}&d1=${d1}&d2=${d2}&trends_by=week`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${OZ_BASE}/niche/price_segmentation?path=${nicheId}&d1=${d1}&d2=${d2}&segmentsCnt=8`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${OZ_BASE}/niche/sellers?path=${nicheId}&d1=${d1}&d2=${d2}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${OZ_BASE}/niche/brands?path=${nicheId}&d1=${d1}&d2=${d2}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
  ]);

  const [info, trends, price, sellers, brands] = await Promise.all([
    infoRes.json(), trendsRes.json(), priceRes.json(), sellersRes.json(), brandsRes.json(),
  ]);

  return {
    market: "oz", info,
    trends: trends ?? [],
    priceSegments: price ?? [],
    sellers: sellers?.data ?? [],
    brands: brands?.data ?? [],
  };
}

export async function detectMarketAndSearch(query: string) {
  const { d1, d2 } = getDates();
  const market = detectMarket(query);
  let subjects: { id: unknown; name: unknown; market: string }[] = [];

  if (market === "wb") {
    subjects = await searchWbSubjects(query);
  } else if (market === "oz") {
    subjects = await searchOzNiches(query);
  } else {
    const [wb, oz] = await Promise.all([
      searchWbSubjects(query),
      searchOzNiches(query),
    ]);
    subjects = [...wb.slice(0, 4), ...oz.slice(0, 4)];
  }

  return { subjects, market, query, period: { d1, d2 } };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, subjectId, subjectMarket } = body;
    const { d1, d2 } = getDates();

    if (!process.env.MPSTATS_TOKEN) {
      console.error("MPSTATS_TOKEN is not set!");
      return NextResponse.json({ error: "token_missing" }, { status: 500 });
    }

    if (subjectId && subjectMarket) {
      const data = subjectMarket === "wb"
        ? await getWbNicheData(Number(subjectId))
        : await getOzNicheData(Number(subjectId));
      return NextResponse.json({ type: "analysis", market: subjectMarket, data, period: { d1, d2 } });
    }

    const result = await detectMarketAndSearch(query ?? "");

    if (!result.subjects.length) {
      return NextResponse.json({ type: "not_found", query });
    }

    return NextResponse.json({ type: "search", ...result });

  } catch (error) {
    console.error("MPStats route error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}