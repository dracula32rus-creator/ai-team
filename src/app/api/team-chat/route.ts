import Anthropic from "@anthropic-ai/sdk";
import { agents } from "@/config/agents";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    // Запускаем всех агентов последовательно
    const responses = [];

    for (const agent of agents) {
      try {
        const res = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          system: agent.systemPrompt,
          messages: [{ role: "user", content: message }],
        });

        const content = res.content[0].type === "text"
          ? res.content[0].text
          : "";

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