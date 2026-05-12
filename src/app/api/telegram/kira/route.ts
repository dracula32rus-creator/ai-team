import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const TEAM: Record<string, string> = {
  "eviiilzues": "Кирилл",
  "vadimcheggg": "Вадим",
  "nadibozhenova": "Надя",
  "margarita030587": "Рита",
  "pivensa": "Сергей",
  "ssidaan": "Настя",
};

function getMemberName(username: string): string {
  return TEAM[username.toLowerCase()] ?? username;
}

async function sendMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

function parseDeadline(text: string): string | null {
  const match = text.match(/до\s+(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/i);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3]
      ? (match[3].length === 2 ? `20${match[3]}` : match[3])
      : new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }

  const days: Record<string, number> = {
    "понедельник": 1, "вторник": 2, "среда": 3, "среду": 3,
    "четверг": 4, "пятница": 5, "пятницу": 5,
  };
  for (const [day, num] of Object.entries(days)) {
    if (text.toLowerCase().includes(day)) {
      const now = new Date();
      const diff = ((num - now.getDay()) + 7) % 7 || 7;
      const target = new Date(now);
      target.setDate(now.getDate() + diff);
      return target.toISOString().split("T")[0];
    }
  }

  return null;
}

function parseTaskList(text: string): { title: string; deadline: string | null; done: boolean }[] {
  const lines = text.split("\n");
  const tasks = [];

  for (const line of lines) {
    const match = line.match(/^\d+[.)]\s+(.+)/);
    if (match) {
      const raw = match[1];
      const done = raw.includes("✅") || raw.includes("☑");
      const title = raw.replace(/✅|☑/g, "").trim();
      if (title.length > 2) {
        tasks.push({ title, deadline: parseDeadline(raw), done });
      }
    }
  }

  return tasks;
}

function formatTask(task: Record<string, string | number>) {
  const statusEmoji: Record<string, string> = {
    "новая": "🆕", "в работе": "🔄", "выполнена": "✅", "просрочена": "🔴",
  };
  const emoji = statusEmoji[task.status as string] ?? "📋";
  return `${emoji} *#${task.id}* ${task.title}\n👤 ${task.assignee} | 📅 ${task.deadline ?? "без срока"} | ${task.status}`;
}

function parseManualTask(text: string) {
  // Ищем всех исполнителей: "для @вася и @петя" или "для @вася, @петя"
  const assigneeMatches = [...text.matchAll(/для\s+@?(\w+)/gi)];
  const additionalMatches = [...text.matchAll(/[,и]\s*@(\w+)/gi)];

  const assignees = [
    ...assigneeMatches.map(m => m[1]),
    ...additionalMatches.map(m => m[1]),
  ].filter(Boolean);

  const controllerMatch = text.match(/контролёр[:\s]+@?(\w+)/i) ?? text.match(/контролер[:\s]+@?(\w+)/i);
  const deadline = parseDeadline(text);

  return {
    assignees: [...new Set(assignees)],
    controller: controllerMatch?.[1] ?? null,
    deadline,
  };
}

export async function POST(req: NextRequest) {
  const update = await req.json();
  const token = process.env.TELEGRAM_TOKEN_KIRA!;

  // Обработка отредактированных сообщений (галочки)
  if (update.edited_message) {
    const msg = update.edited_message;
    const text = msg.text ?? "";
    const fromUsername = msg.from?.username?.toLowerCase() ?? "";
    const memberName = getMemberName(fromUsername);
    const messageId = msg.message_id;

    const parsed = parseTaskList(text);
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].done) {
        await supabase
          .from("tasks")
          .update({ status: "выполнена", updated_at: new Date().toISOString() })
          .eq("assignee", memberName)
          .eq("message_id", messageId)
          .eq("task_index", i + 1);
      }
    }

    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text;
  const fromUsername = message.from?.username?.toLowerCase() ?? "";
  const memberName = getMemberName(fromUsername);
  const messageId = message.message_id;

  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  const mentionedKira = text.toLowerCase().includes("@kira_wb_ozon_bot");
  const replied = message.reply_to_message?.from?.is_bot;

  // Автоматический парсинг нумерованного списка (без тега Киры)
  const taskList = parseTaskList(text);
  if (taskList.length >= 2 && !mentionedKira) {
    let created = 0;
    for (let i = 0; i < taskList.length; i++) {
      const t = taskList[i];
      const { error } = await supabase.from("tasks").insert({
        title: t.title,
        assignee: memberName,
        assignee_username: fromUsername,
        deadline: t.deadline,
        status: t.done ? "выполнена" : "новая",
        chat_id: chatId,
        message_id: messageId,
        task_index: i + 1,
      });
      if (!error) created++;
    }

    if (created > 0) {
      await sendMessage(token, chatId, `📋 Зафиксировала ${created} задач от *${memberName}*`);
    }
    return NextResponse.json({ ok: true });
  }

  if (isGroup && !mentionedKira && !replied) {
    return NextResponse.json({ ok: true });
  }

  const cleanText = text.replace(/@kira_wb_ozon_bot/gi, "").trim();
  const t = cleanText.toLowerCase();

  // Все задачи
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
  const whoMatch = cleanText.match(/задачи\s+@?(\w+)/i);
  if (whoMatch) {
    const name = getMemberName(whoMatch[1]) || whoMatch[1];
    const { data } = await supabase.from("tasks").select("*")
      .or(`assignee.ilike.%${name}%,assignee.ilike.%${whoMatch[1]}%`);
    if (!data?.length) {
      await sendMessage(token, chatId, `У ${name} нет задач.`);
    } else {
      let msg = `📋 *Задачи ${name}:*\n\n`;
      for (const task of data) msg += formatTask(task as Record<string, string | number>) + "\n\n";
      await sendMessage(token, chatId, msg);
    }
    return NextResponse.json({ ok: true });
  }

  // Выполнить задачу
  const doneMatch = cleanText.match(/задача\s+#?(\d+)\s+выполнена/i) ?? cleanText.match(/выполнена\s+#?(\d+)/i);
  if (doneMatch) {
    const { data } = await supabase.from("tasks")
      .update({ status: "выполнена", updated_at: new Date().toISOString() })
      .eq("id", doneMatch[1]).select().single();
    if (data) await sendMessage(token, chatId, `✅ Задача #${data.id} выполнена: *${data.title}*`);
    return NextResponse.json({ ok: true });
  }

  // Сдвинуть дедлайн
  const shiftMatch = cleanText.match(/задача\s+#?(\d+).*?до\s+(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/i);
  if (shiftMatch) {
    const day = shiftMatch[2].padStart(2, "0");
    const month = shiftMatch[3].padStart(2, "0");
    const year = shiftMatch[4] ? (shiftMatch[4].length === 2 ? `20${shiftMatch[4]}` : shiftMatch[4]) : new Date().getFullYear();
    const newDeadline = `${year}-${month}-${day}`;
    const { data } = await supabase.from("tasks")
      .update({ deadline: newDeadline, updated_at: new Date().toISOString() })
      .eq("id", shiftMatch[1]).select().single();
    if (data) await sendMessage(token, chatId, `📅 Дедлайн #${data.id} перенесён на ${day}.${month}.${year}`);
    return NextResponse.json({ ok: true });
  }

  // В работе
  const wipMatch = cleanText.match(/задача\s+#?(\d+)\s+в работе/i);
  if (wipMatch) {
    const { data } = await supabase.from("tasks")
      .update({ status: "в работе", updated_at: new Date().toISOString() })
      .eq("id", wipMatch[1]).select().single();
    if (data) await sendMessage(token, chatId, `🔄 Задача #${data.id} в работе: *${data.title}*`);
    return NextResponse.json({ ok: true });
  }

  // Создать задачу вручную — поддержка нескольких исполнителей
  if (t.match(/задача|задание/) && t.match(/для/)) {
    const parsed = parseManualTask(cleanText);

    if (!parsed.assignees.length) {
      await sendMessage(token, chatId, "❓ Укажи исполнителя: *для @имя*");
      return NextResponse.json({ ok: true });
    }

    const title = cleanText
      .replace(/задача[:\s]*/i, "")
      .replace(/для\s+@?\w+/gi, "")
      .replace(/[,и]\s*@\w+/gi, "")
      .replace(/до\s+[\d.\/-]+/gi, "")
      .replace(/контролёр[:\s]+@?\w+/gi, "")
      .replace(/контролер[:\s]+@?\w+/gi, "")
      .trim();

    const created = [];
    for (const assigneeRaw of parsed.assignees) {
      const assigneeName = getMemberName(assigneeRaw);
      const { data } = await supabase.from("tasks").insert({
        title,
        assignee: assigneeName,
        assignee_username: assigneeRaw,
        controller: parsed.controller ? getMemberName(parsed.controller) : null,
        controller_username: parsed.controller,
        deadline: parsed.deadline,
        chat_id: chatId,
        message_id: messageId,
        status: "новая",
      }).select().single();
      if (data) created.push(data);
    }

    if (created.length > 0) {
      const msg = created.map(d => formatTask(d as Record<string, string | number>)).join("\n\n");
      await sendMessage(token, chatId,
        `✅ Создано ${created.length} ${created.length === 1 ? "задача" : "задачи"}!\n\n${msg}`
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Помощь
  await sendMessage(token, chatId, `🤖 *Кира — менеджер задач*

*Автоматически* фиксирую нумерованные списки задач в чате.

*Создать одному:*
задача для @вася: сделать карточку до 25.05

*Создать нескольким:*
задача для @надя и @рита: обновить карточки до 20.05

*Посмотреть:*
все задачи
задачи Васи

*Обновить:*
задача #3 выполнена
задача #3 в работе
задача #3 до 30.05`);

  return NextResponse.json({ ok: true });
}