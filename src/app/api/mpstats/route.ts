import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://mpstats.io/api/analytics/v1/wb";
const TOKEN = process.env.MPSTATS_TOKEN!;

const headers = {
  "X-Mpstats-TOKEN": TOKEN,
  "Content-Type": "application/json",
};

const d2 = new Date().toISOString().split("T")[0];
const d1 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    // Шаг 1 — ищем нишу по названию
    const subjectsRes = await fetch(`${BASE_URL}/subjects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ keyword: query, startRow: 0, endRow: 5 }),
    });

    const subjectsData = await subjectsRes.json();
    const subject = subjectsData?.data?.[0];

    if (!subject) {
      return NextResponse.json({ error: "Ниша не найдена" }, { status: 404 });
    }

    const subjectId = subject.id;

    // Шаг 2 — параллельно тянем все данные
    const [infoRes, trendsRes, priceRes, sellersRes, brandsRes] = await Promise.all([
      // Основная инфа по нише
      fetch(`${BASE_URL}/subject/${subjectId}?d1=${d1}&d2=${d2}`, { headers }),
      // Тренды
      fetch(`${BASE_URL}/subject/${subjectId}/trends`, {
        method: "POST",
        headers,
        body: JSON.stringify({ d1, d2 }),
      }),
      // Ценовая сегментация
      fetch(`${BASE_URL}/subject/${subjectId}/price_segments`, {
        method: "POST",
        headers,
        body: JSON.stringify({ d1, d2 }),
      }),
      // Топ продавцов
      fetch(`${BASE_URL}/subject/${subjectId}/sellers`, {
        method: "POST",
        headers,
        body: JSON.stringify({ d1, d2, startRow: 0, endRow: 10 }),
      }),
      // Топ брендов
      fetch(`${BASE_URL}/subject/${subjectId}/brands`, {
        method: "POST",
        headers,
        body: JSON.stringify({ d1, d2, startRow: 0, endRow: 5 }),
      }),
    ]);

    const [info, trends, price, sellers, brands] = await Promise.all([
      infoRes.json(),
      trendsRes.json(),
      priceRes.json(),
      sellersRes.json(),
      brandsRes.json(),
    ]);

    return NextResponse.json({
      subject: { id: subjectId, name: subject.name ?? query },
      info,
      trends: trends?.data ?? trends,
      priceSegments: price?.data ?? price,
      sellers: sellers?.data ?? sellers,
      brands: brands?.data ?? brands,
      period: { d1, d2 },
    });

  } catch (error) {
    console.error("MPStats error:", error);
    return NextResponse.json({ error: "MPStats request failed" }, { status: 500 });
  }
}