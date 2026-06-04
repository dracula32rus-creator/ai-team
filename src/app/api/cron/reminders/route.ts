import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function sendMessage(token: string, chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

// Зарплатный календарь
const SALARY_SCHEDULE: Record<number, { name: string; amount: number }[]> = {
  1: [
    { name: "Вадим", amount: 32550 },
    { name: "Надя",  amount: 50000 },
    { name: "Рита",  amount: 32500 },
  ],
  5: [
    { name: "Кирилл", amount: 50000 },
  ],
  15: [
    { name: "Вадим", amount: 25000 },
    { name: "Надя",  amount: 50000 },
    { name: "Рита",  amount: 32500 },
  ],
  25: [
    { name: "Кирилл", amount: 50000 },
  ],
};

const SALARY_RECIPIENT = "@EviiilZues"; // личный чат

export async function GET() {
  try {
    const token = process.env.TELEGRAM_TOKEN_KIRA!;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const dayOfMonth = today.getDate();

    // ── Зарплатные напоминания ────────────────────────────────────────────────
    const salaryToday = SALARY_SCHEDULE[dayOfMonth];
    if (salaryToday?.length) {
      const total = salaryToday.reduce((sum, s) => sum + s.amount, 0);
      let msg = `💰 *Сегодня день зарплаты!*\n\n`;
      for (const s of salaryToday) {
        msg += `👤 *${s.name}* — ${s.amount.toLocaleString("ru-RU")} ₽\n`;
      }
      msg += `\n💳 *Итого к выплате: ${total.toLocaleString("ru-RU")} ₽*`;
      await sendMessage(token, SALARY_RECIPIENT, msg);
    }

    // ── Задачи — дедлайны и просрочки ────────────────────────────────────────
    const { data: dueTomorrow } = await supabase
      .from("tasks")
      .select("*")
      .eq("deadline", tomorrow)
      .neq("status", "выполнена");

    const { data: overdue } = await supabase
      .from("tasks")
      .select("*")
      .lt("deadline", todayStr)
      .neq("status", "выполнена")
      .neq("status", "просрочена");

    if (overdue?.length) {
      for (const task of overdue) {
        await supabase.from("tasks")
          .update({ status: "просрочена", updated_at: new Date().toISOString() })
          .eq("id", task.id);
      }
    }

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