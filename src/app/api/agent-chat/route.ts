import { NextRequest, NextResponse } from "next/server";

function extractExpenseData(text: string): { date: string; amount: string; category: string; description: string } | null {
  const amountMatch = text.match(/(\d[\d\s,]*)\s*(?:р(?:уб)?\.?|₽)/i);
  if (!amountMatch) return null;

  const today = new Date().toLocaleDateString("ru-RU");
  const amount = amountMatch[1].replace(/[\s,]/g, "");

  const categories = ["логистика", "реклама", "закупка", "зарплата", "налоги", "инструменты", "прочее"];
  const category = categories.find(c => text.toLowerCase().includes(c)) ?? "прочее";

  return {
    date: today,
    amount,
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
    console.log("Last message:", lastUserMessage);
    const expense = extractExpenseData(lastUserMessage);
    console.log("Extracted expense:", JSON.stringify(expense));

    if (expense) {
      try {
        const baseUrl = "https://ai-team-42mz.vercel.app";
        const sheetsRes = await fetch(`${baseUrl}/api/sheets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expense),
        });
        const sheetsData = await sheetsRes.json();
        console.log("Sheets response:", JSON.stringify(sheetsData));
      } catch (e) {
        console.error("Failed to save expense:", e);
      }
    }
  }

  return NextResponse.json({ response: text });
}