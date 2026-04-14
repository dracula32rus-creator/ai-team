import { agents } from "@/config/agents";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    const responses = [];

    for (const agent of agents) {
      try {
        const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            messages: [
              { role: "system", content: agent.systemPrompt },
              { role: "user", content: message },
            ],
          }),
        });

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content ?? "";

        responses.push({
          agentId: agent.id,
          agentName: agent.name,
          agentColor: agent.color,
          content,
        });
      } catch {
        responses.push({
          agentId: agent.id,
          agentName: agent.name,
          agentColor: agent.color,
          content: "Не смог ответить на этот вопрос.",
        });
      }
    }

    return NextResponse.json({ responses });

  } catch (error) {
    console.error("Team chat error:", error);
    return NextResponse.json({ error: "Team chat failed" }, { status: 500 });
  }
}