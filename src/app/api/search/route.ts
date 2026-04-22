import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { query, platform } = await req.json();

    // Формируем запрос под платформу
    let searchQuery = query;
    if (platform === "1688") {
      searchQuery = `site:1688.com ${query}`;
    } else if (platform === "alibaba") {
      searchQuery = `site:alibaba.com ${query} wholesale`;
    } else if (platform === "amazon") {
      searchQuery = `site:amazon.com ${query}`;
    } else {
      searchQuery = `${query} site:1688.com OR site:alibaba.com OR site:amazon.com`;
    }

    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: searchQuery,
        num: 10,
        gl: platform === "1688" ? "cn" : "us", // для 1688 китайский регион
      }),
    });

    const data = await res.json();

    // Приводим к единому формату
    const results = (data.organic ?? []).map((item: { title: string; link: string; snippet: string }) => ({
      title: item.title,
      url: item.link,
      content: item.snippet,
    }));

    return NextResponse.json({
      results,
      platform,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}