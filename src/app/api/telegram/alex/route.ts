import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const update = await req.json();
  await handleTelegramMessage(update, "chief-of-staff-alex", process.env.TELEGRAM_TOKEN_ALEX!);
  return NextResponse.json({ ok: true });
}
