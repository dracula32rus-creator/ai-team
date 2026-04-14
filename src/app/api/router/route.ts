import { getAgent } from "@/config/agents";
import { NextRequest, NextResponse } from "next/server";

const routerPrompt = `Ты Алекс, умный роутер AI-команды WB/Ozon магазина.
Анализируй сообщения пользователя и определяй какой специалист должен ответить.

Доступные агенты:
- cfo-finn: прибыль, комиссии маркетплейса, юнит-экономика, маржа, P&L, финансы, налоги, возвраты
- supply-stas: остатки товара, закупки, планирование заказов, стокаут, оборачиваемость, FBO/FBS
- accountant-tanya: расходы компании, учёт трат, категории расходов, таблицы, сводки по периодам
- buyer-nova: поиск новых товаров, анализ ниш, конкуренты, стоит ли заходить в нишу
- content-max: карточки товаров, заголовки, описания, SEO для WB и Ozon, буллеты
- chief-of-staff-alex: стратегия, приоритеты, общие вопросы, непонятно к кому, бизнес в целом

ПРАВИЛА:
- Отвечай ТОЛЬКО id агента, например: cfo-finn
- Никакого другого текста — только id
- При нескольких темах — выбери ОСНОВНУЮ
- Если непонятно — отправляй к chief-of-staff-alex`;

async function callAI(systemPrompt: string, messages: { role: string; content: string }[], maxTokens = 1000) {
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4.6",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1].content;

    const agentId = (await callAI(routerPrompt, [{ role: "user", content: lastMessage }], 20)).trim();
    const agent = getAgent(agentId) ?? getAgent("chief-of-staff-alex");

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const response = await callAI(agent.systemPrompt, messages);

    return NextResponse.json({
      response,
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
    });

  } catch (error) {
    console.error("Router error:", error);
    return NextResponse.json({ error: "Router failed" }, { status: 500 });
  }
}
