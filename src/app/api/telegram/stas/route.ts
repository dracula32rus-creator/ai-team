import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const update = await req.json();
  await handleTelegramMessage(update, "supply-stas", process.env.TELEGRAM_TOKEN_STAS!);
  return NextResponse.json({ ok: true });
}
