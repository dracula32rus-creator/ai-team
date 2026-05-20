import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.MPSTATS_TOKEN!;
const WB_BASE = "https://mpstats.io/api/analytics/v1/wb";
const OZ_BASE = "https://mpstats.io/api/analytics/v1/oz";

const headers = {
  "X-Mpstats-TOKEN": TOKEN,
  "Content-Type": "application/json",
};

const d2 = new Date().toISOString().split("T")[0];
const d1 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

function detectMarket(query: string): "wb" | "oz" | "both" {
  const t = query.toLowerCase();
  if (t.match(/\bwb\b|вб|вайлдберриз|wildberries/)) return "wb";
  if (t.match(/\boz\b|озон|ozon/)) return "oz";
  return "both";
}

async function searchWbSubjects(keyword: string) {
  const res = await fetch(`${WB_BASE}/subjects`, {
    method: "POST",
    headers,
    body: JSON.stringify({ keyword, startRow: 0, endRow: 8 }),
  });
  const data = await res.json();
  return (data?.data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id,
    name: s.name,
    market: "wb",
  }));
}

async function searchOzNiches(keyword: string) {
  const res = await fetch(`${OZ_BASE}/niche/list?search=${encodeURIComponent(keyword)}&startRow=0&endRow=8`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const data = await res.json();
  return (data?.data ?? []).map((s: Record<string, unknown>) => ({
    id: s.category_id,
    name: s.category,
    market: "oz",
  }));
}

async function getWbNicheData(subjectId: number) {
  const [infoRes, trendsRes, priceRes, sellersRes, brandsRes] = await Promise.all([
    fetch(`${WB_BASE}/subject/${subjectId}?d1=${d1}&d2=${d2}`, { headers }),
    fetch(`${WB_BASE}/subject/${subjectId}/trends`, { method: "POST", headers, body: JSON.stringify({ d1, d2 }) }),
    fetch(`${WB_BASE}/subject/${subjectId}/price_segments`, { method: "POST", headers, body: JSON.stringify({ d1, d2 }) }),
    fetch(`${WB_BASE}/subject/${subjectId}/sellers`, { method: "POST", headers, body: JSON.stringify({ d1, d2, startRow: 0, endRow: 10 }) }),
    fetch(`${WB_BASE}/subject/${subjectId}/brands`, { method: "POST", headers, body: JSON.stringify({ d1, d2, startRow: 0, endRow: 5 }) }),
  ]);

  const [info, trends, price, sellers, brands] = await Promise.all([
    infoRes.json(), trendsRes.json(), priceRes.json(), sellersRes.json(), brandsRes.json(),
  ]);

  return { market: "wb", info, trends: trends?.data ?? trends, priceSegments: price?.data ?? price, sellers: sellers?.data ?? sellers, brands: brands?.data ?? brands };
}

async function getOzNicheData(nicheId: number) {
  const [infoRes, trendsRes, priceRes, sellersRes, brandsRes] = await Promise.all([
    fetch(`${OZ_BASE}/niche/${nicheId}`, { headers }),
    fetch(`${OZ_BASE}/niche/trends?path=${nicheId}&d1=${d1}&d2=${d2}&trends_by=week`, { method: "POST", headers, body: JSON.stringify({}) }),
    fetch(`${OZ_BASE}/niche/price_segmentation?path=${nicheId}&d1=${d1}&d2=${d2}&segmentsCnt=8`, { method: "POST", headers, body: JSON.stringify({}) }),
    fetch(`${OZ_BASE}/niche/sellers?path=${nicheId}&d1=${d1}&d2=${d2}`, { method: "POST", headers, body: JSON.stringify({}) }),
    fetch(`${OZ_BASE}/niche/brands?path=${nicheId}&d1=${d1}&d2=${d2}`, { method: "POST", headers, body: JSON.stringify({}) }),
  ]);

  const [info, trends, price, sellers, brands] = await Promise.all([
    infoRes.json(), trendsRes.json(), priceRes.json(), sellersRes.json(), brandsRes.json(),
  ]);

  return { market: "oz", info, trends: trends ?? [], priceSegments: price ?? [], sellers: sellers?.data ?? [], brands: brands?.data ?? [] };
}

export async function POST(req: NextRequest) {
  try {
    const { query, subjectId, subjectMarket } = await req.json();

    // Если уже выбрали конкретную нишу — тянем полные данные
    if (subjectId && subjectMarket) {
      const data = subjectMarket === "wb"
        ? await getWbNicheData(Number(subjectId))
        : await getOzNicheData(Number(subjectId));
      return NextResponse.json({ type: "analysis", market: subjectMarket, data, period: { d1, d2 } });
    }

    // Поиск ниш по запросу
    const market = detectMarket(query);
    let subjects: { id: unknown; name: unknown; market: string }[] = [];

    if (market === "wb") {
      subjects = await searchWbSubjects(query);
    } else if (market === "oz") {
      subjects = await searchOzNiches(query);
    } else {
      // Оба маркета параллельно
      const [wb, oz] = await Promise.all([
        searchWbSubjects(query),
        searchOzNiches(query),
      ]);
      subjects = [...wb.slice(0, 4), ...oz.slice(0, 4)];
    }

    if (!subjects.length) {
      return NextResponse.json({ type: "not_found", query });
    }

    return NextResponse.json({ type: "search", subjects, market, query });

  } catch (error) {
    console.error("MPStats error:", error);
    return NextResponse.json({ error: "MPStats request failed" }, { status: 500 });
  }
}