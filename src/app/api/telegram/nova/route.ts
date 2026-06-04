import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";

export const maxDuration = 300; // Vercel Pro: 5 мин

export async function POST(req: NextRequest) {
  const update = await req.json();

  // Сразу 200 — Telegram не будет слать повторы
  const responsePromise = NextResponse.json({ ok: true });

  // Обрабатываем в фоне без блокировки ответа
  handleTelegramMessage(update, "buyer-nova", process.env.TELEGRAM_TOKEN_NOVA!)
    .catch(e => console.error("Nova handler error:", e));

  return responsePromise;
}