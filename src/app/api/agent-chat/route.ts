import { NextRequest, NextResponse } from "next/server";

function extractExpenseData(text: string): { date: string; amount: string; category: string; description: string } | null {
  const amountMatch = text.match(/(\d[\d\s,]*(?:\.\d+)?)\s*([кkтtмm]{1,2})?[\s]*(?:р(?:уб)?\.?|₽)?/i);
  if (!amountMatch || !amountMatch[1]) return null;

  // Ищем дату в формате ДД.ММ или ДД.ММ.ГГГГ
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

  if (suffix === "кк" || suffix === "kk") {
    amount = amount * 1_000_000;
  } else if (suffix === "к" || suffix === "k") {
    amount = amount * 1_000;
  } else if (suffix === "т" || suffix === "t") {
    amount = amount * 1_000;
  } else if (suffix === "м" || suffix === "m") {
    amount = amount * 1_000_000;
  }

  if (isNaN(amount) || amount <= 0) return null;

  const categories = ["логистика", "реклама", "закупка", "зарплата", "налоги", "инструменты", "бартер", "прочее"];
  const category = categories.find(c => text.toLowerCase().includes(c)) ?? "прочее";

  return {
    date,
    amount: String(Math.round(amount)),
    category,
    description: text,
  };
}

export async function POST(req: NextRequest) {
  const { messages, systemPrompt, agentId } = await req.json();

  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4.6",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
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