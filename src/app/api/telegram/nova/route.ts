import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const update = await req.json();
  const messageId = update?.message?.message_id;

  // Дедупликация через Supabase — работает между serverless инстансами
  if (messageId) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      );
      const key = `nova_msg_${messageId}`;
      const { data } = await supabase
        .from("tasks")
        .select("id")
        .eq("title", key)
        .single();

      if (data) {
        console.log("Nova: duplicate message_id", messageId, "skipped");
        return NextResponse.json({ ok: true });
      }

      // Записываем что начали обработку
      await supabase.from("tasks").insert({
        title: key,
        status: "processing",
        assignee: "nova-dedup",
        deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
    } catch (e) {
      console.error("Dedup error:", e);
      // Если Supabase недоступен — всё равно продолжаем
    }
  }

  await handleTelegramMessage(update, "buyer-nova", process.env.TELEGRAM_TOKEN_NOVA!);
  return NextResponse.json({ ok: true });
}