import { NextRequest, NextResponse } from "next/server";
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

function parseTask(text: string) {
  const deadlineMatch = text.match(/до\s+(\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?)/i);
  const assigneeMatch = text.match(/для\s+@?(\w+)/i) ?? text.match(/исполнитель[:\s]+@?(\w+)/i);
  const controllerMatch = text.match(/контролёр[:\s]+@?(\w+)/i) ?? text.match(/контролер[:\s]+@?(\w+)/i);

  let deadline: string | null = null;
  if (deadlineMatch) {
    const parts = deadlineMatch[1].split(/[.\/-]/);
    if (parts.length >= 2) {
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2] ? (parts[2].length === 2 ? `20${parts[2]}` : parts[2]) : new Date().getFullYear();
      deadline = `${year}-${month}-${day}`;
    }
  }

  return {
    assignee: assigneeMatch?.[1] ?? null,
    controller: controllerMatch?.[1] ?? null,
    deadline,
  };
}

function formatTask(task: Record<string, string | number>) {
  const statusEmoji: Record<string, string> = {
    "новая": "🆕",
    "в работе": "🔄",
    "выполнена": "✅",
    "просрочена": "🔴",
  };
  const emoji = statusEmoji[task.status as string] ?? "📋";
  return `${emoji} *#${task.id}* ${task.title}\n👤 ${task.assignee} | 📅 ${task.deadline ?? "без срока"} | ${task.status}${task.controller ? `\n👁 Контролёр: ${task.controller}` : ""}`;
}

export async function POST(req: NextRequest) {
  const update = await req.json();
  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text;
  const token = process.env.TELEGRAM_TOKEN_KIRA!;
  const botUsername = "kira";

  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  if (isGroup) {
    const mentioned = text.toLowerCase().includes(`@${botUsername}`);
    const replied = message.reply_to_message?.from?.is_bot;
    if (!mentioned && !replied) return NextResponse.json({ ok: true });
  }

  const cleanText = text.replace(/@\w+/g, "").trim();
  const t = cleanText.toLowerCase();

  // Показать все задачи
  if (t.match(/все задачи|покажи задачи|список задач/)) {
    const { data } = await supabase.from("tasks").select("*").order("deadline", { ascending: true });
    if (!data?.length) {
      await sendMessage(token, chatId, "📋 Задач пока нет.");
    } else {
      const grouped: Record<string, typeof data> = {};
      for (const task of data) {
        if (!grouped[task.status]) grouped[task.status] = [];
        grouped[task.status].push(task);
      }
      let msg = "📋 *Все задачи:*\n\n";
      for (const [status, tasks] of Object.entries(grouped)) {
        msg += `*${status.toUpperCase()}*\n`;
        for (const task of tasks) msg += formatTask(task as Record<string, string | number>) + "\n\n";
      }
      await sendMessage(token, chatId, msg);
    }
    return NextResponse.json({ ok: true });
  }

  // Задачи конкретного человека
  const whoMatch = cleanText.match(/задачи\s+(\w+)/i);
  if (whoMatch) {
    const { data } = await supabase.from("tasks").select("*").ilike("assignee", `%${whoMatch[1]}%`);
    if (!data?.length) {
      await sendMessage(token, chatId, `У ${whoMatch[1]} нет задач.`);
    } else {
      let msg = `📋 *Задачи ${whoMatch[1]}:*\n\n`;
      for (const task of data) msg += formatTask(task as Record<string, string | number>) + "\n\n";
      await sendMessage(token, chatId, msg);
    }
    return NextResponse.json({ ok: true });
  }

  // Выполнить задачу
  const doneMatch = cleanText.match(/задача\s+#?(\d+)\s+выполнена/i) ?? cleanText.match(/выполнена\s+#?(\d+)/i);
  if (doneMatch) {
    const { data } = await supabase.from("tasks").update({ status: "выполнена", updated_at: new Date().toISOString() }).eq("id", doneMatch[1]).select().single();
    if (data) await sendMessage(token, chatId, `✅ Задача #${data.id} отмечена выполненной: *${data.title}*`);
    return NextResponse.json({ ok: true });
  }

  // Сдвинуть дедлайн
  const deadlineMatch = cleanText.match(/задача\s+#?(\d+).*?до\s+(\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?)/i);
  if (deadlineMatch) {
    const parts = deadlineMatch[2].split(/[.\/-]/);
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = parts[2] ? (parts[2].length === 2 ? `20${parts[2]}` : parts[2]) : new Date().getFullYear();
    const newDeadline = `${year}-${month}-${day}`;
    const { data } = await supabase.from("tasks").update({ deadline: newDeadline, updated_at: new Date().toISOString() }).eq("id", deadlineMatch[1]).select().single();
    if (data) await sendMessage(token, chatId, `📅 Дедлайн задачи #${data.id} перенесён на ${day}.${month}.${year}`);
    return NextResponse.json({ ok: true });
  }

  // Создать задачу
  if (t.match(/задача|задание|сделать|выполнить/) && t.match(/для|исполнитель/)) {
    const parsed = parseTask(cleanText);
    const title = cleanText
      .replace(/задача[:\s]*/i, "")
      .replace(/для\s+@?\w+/gi, "")
      .replace(/до\s+[\d.\/-]+/gi, "")
      .replace(/контролёр[:\s]+@?\w+/gi, "")
      .trim();

    if (!parsed.assignee) {
      await sendMessage(token, chatId, "❓ Укажи исполнителя: *для @имя*");
      return NextResponse.json({ ok: true });
    }

    const { data } = await supabase.from("tasks").insert({
      title,
      assignee: parsed.assignee,
      assignee_username: parsed.assignee,
      controller: parsed.controller,
      controller_username: parsed.controller,
      deadline: parsed.deadline,
      chat_id: chatId,
      status: "новая",
    }).select().single();

    if (data) {
      await sendMessage(token, chatId,
        `✅ Задача создана!\n\n${formatTask(data as Record<string, string | number>)}`
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Помощь
  await sendMessage(token, chatId, `🤖 *Кира — менеджер задач*

*Создать задачу:*
задача для @вася: сделать карточку до 25.05 контролёр @петя

*Посмотреть задачи:*
все задачи
задачи Васи

*Обновить:*
задача #3 выполнена
задача #3 до 30.05`);

  return NextResponse.json({ ok: true });
}