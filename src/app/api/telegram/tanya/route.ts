import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const update = await req.json();
  await handleTelegramMessage(update, "accountant-tanya", process.env.TELEGRAM_TOKEN_TANYA!);
  return NextResponse.json({ ok: true });
}
