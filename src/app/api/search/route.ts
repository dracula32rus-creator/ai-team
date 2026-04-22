import { NextRequest, NextResponse } from "next/server";

// Определяем это карточка товара или каталог
function isProductPage(url: string): boolean {
  const u = url.toLowerCase();
  // Признаки конкретного товара
  const productPatterns = [
    /\/offer\//,           // 1688 карточки
    /\/product\//,          // alibaba карточки
    /\/dp\/[A-Z0-9]/,       // amazon карточки
    /\/p\//,                // общие карточки
    /\/item\//,             // общие карточки
    /detail\.1688/,         // 1688 детальные страницы
    /\.html\?.*(?:id=|spm=)/, // ID параметр
  ];
  return productPatterns.some(p => p.test(u));
}

// Определяем каталог/категорию
function isCatalogPage(url: string): boolean {
  const u = url.toLowerCase();
  const catalogPatterns = [
    /\/g\//,                // alibaba категории /g/frozen-bags.html
    /\/showroom\//,         // alibaba showroom
    /\/category\//,         // общие категории
    /\/s\/.*\.htm/,         // 1688 поиск
    /selloffer\/offer_search/, // 1688 поиск
  ];
  return catalogPatterns.some(p => p.test(u));
}

export async function POST(req: NextRequest) {
  try {
    const { query, platform } = await req.json();

    let searchQuery = query;
    if (platform === "1688") {
      searchQuery = `site:detail.1688.com OR site:1688.com/offer ${query}`;
    } else if (platform === "alibaba") {
      searchQuery = `site:alibaba.com/product-detail ${query} wholesale`;
    } else if (platform === "amazon") {
      searchQuery = `site:amazon.com/dp ${query}`;
    } else {
      searchQuery = `${query} site:detail.1688.com OR site:alibaba.com/product-detail OR site:amazon.com/dp`;
    }

    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: searchQuery,
        num: 15,
        gl: platform === "1688" ? "cn" : "us",
      }),
    });

    const data = await res.json();

    const allResults = (data.organic ?? []).map((item: { title: string; link: string; snippet: string }) => ({
      title: item.title,
      url: item.link,
      content: item.snippet,
      isProduct: isProductPage(item.link),
      isCatalog: isCatalogPage(item.link),
    }));

    // Сортируем: сначала конкретные товары, потом остальные
    const sorted = [
      ...allResults.filter((r: { isProduct: boolean }) => r.isProduct),
      ...allResults.filter((r: { isProduct: boolean; isCatalog: boolean }) => !r.isProduct && !r.isCatalog),
      ...allResults.filter((r: { isCatalog: boolean }) => r.isCatalog),
    ].slice(0, 5);

    return NextResponse.json({
      results: sorted,
      platform,
      hasProducts: sorted.some((r: { isProduct: boolean }) => r.isProduct),
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}