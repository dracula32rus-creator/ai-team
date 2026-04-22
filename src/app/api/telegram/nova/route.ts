import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const update = await req.json();
  await handleTelegramMessage(update, "buyer-nova", process.env.TELEGRAM_TOKEN_NOVA!);
  return NextResponse.json({ ok: true });
}
