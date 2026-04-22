import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { query, platform } = await req.json();

    // Формируем поисковый запрос в зависимости от платформы
    let searchQuery = query;
    const domains: Record<string, string[]> = {
      "1688": ["1688.com"],
      "alibaba": ["alibaba.com"],
      "amazon": ["amazon.com", "amazon.de"],
      "all": ["1688.com", "alibaba.com", "amazon.com"],
    };

    const includeDomains = domains[platform] ?? domains.all;

    if (platform === "1688") {
      searchQuery = `${query} 批发 供应商`; // "оптом поставщик" по-китайски
    } else if (platform === "alibaba") {
      searchQuery = `${query} wholesale supplier`;
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: searchQuery,
        search_depth: "basic",
        include_domains: includeDomains,
        max_results: 5,
      }),
    });

    const data = await res.json();

    return NextResponse.json({
      results: data.results ?? [],
      platform,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}