import { NextRequest, NextResponse } from "next/server";

function detectCategory(text: string): string {
  const t = text.toLowerCase();
  if (t.match(/зп|зарплат|оклад|выплат/)) return "зарплата";
  if (t.match(/аренд/)) return "аренда";
  if (t.match(/короб|стрейч|плёнк|пленк|этикет|скотч|материал/)) return "материалы";
  if (t.match(/упаков/)) return "упаковка";
  if (t.match(/закуп|поставщик|китай|рынок/)) return "закупки";
  if (t.match(/логистик|фрахт|карго|груз/)) return "логистика";
  if (t.match(/курьер|вб|wb|озон|ozon|яндекс|сдэк|cdek|доставк/)) return "доставка";
  if (t.match(/бартер/)) return "бартеры";
  if (t.match(/реклам|блогер|маркетинг/)) return "реклама";
  return "прочее";
}

function extractExpenseData(text: string) {
  const amountMatch = text.match(/(\d[\d\s,]*(?:\.\d+)?)\s*([кkтtмm]{1,2})?[\s]*(?:р(?:уб)?\.?|₽)?/i);
  if (!amountMatch || !amountMatch[1]) return null;

  const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
  let date: string;
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3]
      ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3])
      : new Date().getFullYear();
    date = `${day}.${month}.${year}`;
  } else {
    date = new Date().toLocaleDateString("ru-RU");
  }

  let amount = parseFloat(amountMatch[1].replace(/[\s,]/g, ""));
  const suffix = amountMatch[2]?.toLowerCase() ?? "";

  if (suffix === "кк" || suffix === "kk") amount *= 1_000_000;
  else if (suffix === "к" || suffix === "k" || suffix === "т" || suffix === "t") amount *= 1_000;
  else if (suffix === "м" || suffix === "m") amount *= 1_000_000;

  if (isNaN(amount) || amount <= 0) return null;

  return {
    date,
    amount: String(Math.round(amount)),
    category: detectCategory(text),
    description: text,
  };
}

function detectPlatform(text: string): string {
  const t = text.toLowerCase();
  if (t.match(/1688|таобао|оптом китай/)) return "1688";
  if (t.match(/alibaba|алибаба/)) return "alibaba";
  if (t.match(/amazon|амазон/)) return "amazon";
  return "all";
}

async function searchProducts(query: string, platform: string) {
  const baseUrl = "https://ai-team-42mz.vercel.app";
  const res = await fetch(`${baseUrl}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, platform }),
  });
  const data = await res.json();
  return data.results ?? [];
}

// Определяем, нужно ли Финну тянуть отчёт из Ozon
function needsOzonReport(text: string): boolean {
  const t = text.toLowerCase();
  return Boolean(
    t.match(/прибыль|выручк|доход|отчёт|отчет|продаж|юнит-эконом|unit-economics|комисс/) &&
    t.match(/озон|ozon|маркетплейс|период|месяц|неделя|квартал|год/)
  );
}

// Вытаскиваем период из текста
function extractPeriod(text: string): { from?: string; to?: string } {
  const now = new Date();
  const t = text.toLowerCase();

  if (t.includes("сегодня")) {
    const today = now.toISOString().split("T")[0];
    return { from: today, to: today };
  }
  if (t.match(/вчера/)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const d = yesterday.toISOString().split("T")[0];
    return { from: d, to: d };
  }
  if (t.match(/недел/)) {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { from: weekAgo.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
  }
  if (t.match(/месяц/)) {
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    return { from: monthAgo.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
  }
  // По умолчанию — последние 30 дней
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);
  return { from: monthAgo.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
}

async function getOzonReport(dateFrom: string, dateTo: string) {
  const baseUrl = "https://ai-team-42mz.vercel.app";
  const res = await fetch(`${baseUrl}/api/ozon/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dateFrom, dateTo }),
  });
  return await res.json();
}

export async function POST(req: NextRequest) {
  const { messages, systemPrompt, agentId } = await req.json();

  let extraContext = "";

  // Если это Финн и вопрос про деньги — тянем отчёт Ozon
  if (agentId === "cfo-finn") {
    const lastUserMessage = messages[messages.length - 1]?.content ?? "";
    if (needsOzonReport(lastUserMessage)) {
      try {
        const period = extractPeriod(lastUserMessage);
        const report = await getOzonReport(period.from!, period.to!);
        if (report.summary) {
          extraContext = `\n\n[LIVE OZON DATA for period ${report.period.from} to ${report.period.to}]
Выручка: ${report.summary.totalRevenue} ₽
Комиссии маркетплейса: ${report.summary.totalCommissions} ₽
Логистика: ${report.summary.totalLogistics} ₽
Возвраты: ${report.summary.totalReturns} ₽
Чистая прибыль до расходов: ${report.summary.netProfit} ₽
Заказов доставлено: ${report.summary.ordersCount}
Возвратов: ${report.summary.returnsCount}

Используй эти реальные цифры из Ozon API в своём ответе. Помни — это только маркетплейс, без учёта твоих внутренних расходов (зарплата, аренда, материалы и т.д.).`;
        }
      } catch (e) {
        console.error("Ozon report failed:", e);
      }
    }
  }

  // Если это Лин — ищем товары
  if (agentId === "scout-lin") {
    const lastUserMessage = messages[messages.length - 1]?.content ?? "";
    const platform = detectPlatform(lastUserMessage);

    try {
      const results = await searchProducts(lastUserMessage, platform);
      if (results.length > 0) {
        extraContext = `\n\nSearch results from ${platform}:\n` +
          results.map((r: { title: string; url: string; content: string }, i: number) =>
            `${i + 1}. ${r.title}\nURL: ${r.url}\nОписание: ${r.content?.slice(0, 200)}`
          ).join("\n\n");
      }
    } catch (e) {
      console.error("Search failed:", e);
    }
  }

  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4.6",
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt + extraContext },
        ...messages,
      ],
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  if (agentId === "accountant-tanya") {
    const lastUserMessage = messages[messages.length - 1]?.content ?? "";
    const expense = extractExpenseData(lastUserMessage);

    if (expense) {
      try {
        const baseUrl = "https://ai-team-42mz.vercel.app";
        await fetch(`${baseUrl}/api/sheets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expense),
        });
      } catch (e) {
        console.error("Failed to save expense:", e);
      }
    }
  }

  return NextResponse.json({ response: text });
}