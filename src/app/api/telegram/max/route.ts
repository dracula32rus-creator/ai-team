import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const update = await req.json();
  await handleTelegramMessage(update, "content-max", process.env.TELEGRAM_TOKEN_MAX!);
  return NextResponse.json({ ok: true });
}
