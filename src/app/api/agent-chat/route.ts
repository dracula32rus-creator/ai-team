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

function extractExpenseData(text: string): { date: string; amount: string; category: string; description: string } | null {
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

// Определяем платформу поиска из текста
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

export async function POST(req: NextRequest) {
  const { messages, systemPrompt, agentId } = await req.json();

  let extraContext = "";

  // Если это Лин — ищем товары перед генерацией ответа
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