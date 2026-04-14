import Anthropic from "@anthropic-ai/sdk";
import { getAgent } from "@/config/agents";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

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

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1].content;

    const routerRes = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 20,
      system: routerPrompt,
      messages: [{ role: "user", content: lastMessage }],
    });

    const agentId = routerRes.content[0].type === "text"
      ? routerRes.content[0].text.trim()
      : "chief-of-staff-alex";

    const agent = getAgent(agentId) ?? getAgent("chief-of-staff-alex");

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const agentRes = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: agent.systemPrompt,
      messages,
    });

    const response = agentRes.content[0].type === "text"
      ? agentRes.content[0].text
      : "";

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