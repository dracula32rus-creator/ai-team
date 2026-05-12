import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function sendMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    // Только завтрашние дедлайны для напоминания
    const { data: dueTomorrow } = await supabase
      .from("tasks")
      .select("*")
      .eq("deadline", tomorrow)
      .neq("status", "выполнена");

    // Просроченные — обновляем статус
    const { data: overdue } = await supabase
      .from("tasks")
      .select("*")
      .lt("deadline", today)
      .neq("status", "выполнена")
      .neq("status", "просрочена");

    if (overdue?.length) {
      for (const task of overdue) {
        await supabase.from("tasks")
          .update({ status: "просрочена", updated_at: new Date().toISOString() })
          .eq("id", task.id);
      }
    }

    const token = process.env.TELEGRAM_TOKEN_KIRA!;
    const chatGroups: Record<number, { tomorrow: typeof dueTomorrow; overdue: typeof overdue }> = {};

    for (const task of (dueTomorrow ?? [])) {
      if (!task.chat_id) continue;
      if (!chatGroups[task.chat_id]) chatGroups[task.chat_id] = { tomorrow: [], overdue: [] };
      chatGroups[task.chat_id].tomorrow!.push(task);
    }

    for (const task of (overdue ?? [])) {
      if (!task.chat_id) continue;
      if (!chatGroups[task.chat_id]) chatGroups[task.chat_id] = { tomorrow: [], overdue: [] };
      chatGroups[task.chat_id].overdue!.push(task);
    }

    for (const [chatId, data] of Object.entries(chatGroups)) {
      let msg = "☀️ *Доброе утро! Сводка по задачам:*\n\n";

      if (data.overdue?.length) {
        msg += "🔴 *Просрочено:*\n";
        for (const t of data.overdue) msg += `• #${t.id} ${t.title} — *${t.assignee}*\n`;
        msg += "\n";
      }

      if (data.tomorrow?.length) {
        msg += "⚠️ *Завтра дедлайн:*\n";
        for (const t of data.tomorrow) msg += `• #${t.id} ${t.title} — *${t.assignee}*\n`;
      }

      await sendMessage(token, Number(chatId), msg);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reminders error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}