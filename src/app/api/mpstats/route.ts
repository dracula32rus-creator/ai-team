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
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const d2 = yesterday.toISOString().split("T")[0];
  const d1 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
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

  const [infoRes, sellersRes, brandsRes, priceRes, trendsRes, byDateRes] = await Promise.all([
    fetch(`${base}/${subjectId}`, { headers: h }),
    fetch(`${base}/sellers?${q}&startRow=0&endRow=10`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/brands?${q}&startRow=0&endRow=5`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/price_segmentation?${q}`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/trends?${q}&trends_by=week`, { method: "POST", headers: h, body: JSON.stringify({}) }),
    fetch(`${base}/by_date?${q}&groupBy=week`, { method: "POST", headers: h, body: JSON.stringify({}) }),
  ]);

  const results = await Promise.all([
    infoRes.text(), sellersRes.text(), brandsRes.text(),
    priceRes.text(), trendsRes.text(), byDateRes.text(),
  ]);

  console.log("WB info status:", infoRes.status, results[0].slice(0, 100));
  console.log("WB sellers status:", sellersRes.status, results[1].slice(0, 100));
  console.log("WB brands status:", brandsRes.status, results[2].slice(0, 100));
  console.log("WB price status:", priceRes.status, results[3].slice(0, 100));
  console.log("WB trends status:", trendsRes.status, results[4].slice(0, 100));

  const parse = (text: string) => { try { return JSON.parse(text); } catch { return {}; } };
  const [info, sellers, brands, price, trends, byDate] = results.map(parse);

  return {
    market: "wb",
    info,
    sellers: sellers?.data ?? sellers ?? [],
    brands: brands?.data ?? brands ?? [],
    priceSegments: price?.data ?? price ?? [],
    trends: trends?.data ?? trends ?? [],
    byDate: byDate?.data ?? byDate ?? [],
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

    const market = detectMarket(query ?? "");
    let subjects: { id: unknown; name: unknown; market: string }[] = [];

    if (market === "wb") {
      subjects = await searchWbSubjects(query);
    } else if (market === "oz") {
      subjects = await searchOzNiches(query);
    } else {
      const [wb, oz] = await Promise.all([searchWbSubjects(query), searchOzNiches(query)]);
      subjects = [...wb.slice(0, 4), ...oz.slice(0, 4)];
    }

    if (!subjects.length) {
      return NextResponse.json({ type: "not_found", query });
    }

    return NextResponse.json({ type: "search", subjects, market, query });

  } catch (error) {
    console.error("MPStats route error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}