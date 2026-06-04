import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";

export const maxDuration = 300;

// Дедупликация — храним обработанные message_id последние 5 минут
const processed = new Map<number, number>();

export async function POST(req: NextRequest) {
  const update = await req.json();

  const messageId = update?.message?.message_id;
  if (messageId) {
    const now = Date.now();
    // Чистим старые записи
    for (const [id, ts] of processed.entries()) {
      if (now - ts > 5 * 60 * 1000) processed.delete(id);
    }
    // Если уже обрабатывали — игнорируем повтор
    if (processed.has(messageId)) {
      console.log("Nova: duplicate message_id", messageId, "— skipped");
      return NextResponse.json({ ok: true });
    }
    processed.set(messageId, now);
  }

  await handleTelegramMessage(update, "buyer-nova", process.env.TELEGRAM_TOKEN_NOVA!);
  return NextResponse.json({ ok: true });
}