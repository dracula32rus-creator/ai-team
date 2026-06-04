import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const update = await req.json();
  const messageId = update?.message?.message_id;

  if (messageId) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      );
      const key = `nova_msg_${messageId}`;

      // Используем отдельную таблицу dedup или upsert в tasks с минимальными полями
      const { data, error } = await supabase
        .from("tasks")
        .select("id")
        .eq("title", key)
        .maybeSingle();

      if (data) {
        console.log("Nova: duplicate", messageId, "skipped");
        return NextResponse.json({ ok: true });
      }

      // insert с только обязательными полями
      await supabase.from("tasks").insert({
        title: key,
        assignee: "dedup",
        assignee_username: "dedup",
        controller: "dedup",
        controller_username: "dedup",
        status: "done",
        chat_id: 0,
        message_id: messageId,
        task_index: 0,
        archived: false,
      });
    } catch (e) {
      console.error("Dedup error:", e);
    }
  }

  await handleTelegramMessage(update, "buyer-nova", process.env.TELEGRAM_TOKEN_NOVA!);
  return NextResponse.json({ ok: true });
}