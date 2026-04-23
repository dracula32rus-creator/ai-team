import { getAgent } from "@/config/agents";

interface TelegramPhoto {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhoto[];
  reply_to_message?: { from?: { username?: string; is_bot?: boolean } };
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

function detectPlatform(text: string): string {
  const t = text.toLowerCase();
  if (t.match(/1688|таобао|оптом китай/)) return "1688";
  if (t.match(/alibaba|алибаба/)) return "alibaba";
  if (t.match(/amazon|амазон/)) return "amazon";
  return "all";
}

async function searchProducts(query: string, platform: string) {
  const res = await fetch("https://ai-team-42mz.vercel.app/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, platform }),
  });
  const data = await res.json();
  return data.results ?? [];
}

function needsOzonReport(text: string): boolean {
  const t = text.toLowerCase();
  return Boolean(
    t.match(/прибыль|выручк|доход|отчёт|отчет|продаж|юнит-эконом|unit-economics|комисс/) &&
    t.match(/озон|ozon|маркетплейс|период|месяц|неделя|квартал|год|сегодня|вчера/)
  );
}

function extractPeriod(text: string): { from: string; to: string } {
  const now = new Date();
  const t = text.toLowerCase();

  if (t.includes("сегодня")) {
    const today = now.toISOString().split("T")[0];
    return { from: today, to: today };
  }
  if (t.match(/вчера/)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const d = yesterday.toISOString().split("T")[0];
    return { from: d, to: d };
  }
  if (t.match(/недел/)) {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { from: weekAgo.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
  }
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);
  return { from: monthAgo.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
}

async function getOzonReport(dateFrom: string, dateTo: string) {
  const res = await fetch("https://ai-team-42mz.vercel.app/api/ozon/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dateFrom, dateTo }),
  });
  return await res.json();
}

// Скачиваем Excel файл из нашего API и отправляем в Telegram
async function sendOzonExcel(
  botToken: string,
  chatId: number,
  dateFrom: string,
  dateTo: string
): Promise<boolean> {
  try {
    const res = await fetch("https://ai-team-42mz.vercel.app/api/ozon/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateFrom, dateTo }),
    });

    if (!res.ok) return false;

    const buffer = Buffer.from(await res.arrayBuffer());
    const fileName = `ozon-report-${dateFrom}-${dateTo}.xlsx`;

    // Отправляем файл в Telegram через multipart/form-data
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("caption", `📊 Отчёт Ozon: ${dateFrom} — ${dateTo}`);
    formData.append(
      "document",
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      fileName
    );

    const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST",
      body: formData,
    });

    return sendRes.ok;
  } catch (e) {
    console.error("Excel send error:", e);
    return false;
  }
}

async function getPhotoBase64(fileId: string, botToken: string): Promise<string | null> {
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;

    const imageRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return base64;
  } catch (e) {
    console.error("Photo download error:", e);
    return null;
  }
}

async function describeImage(imageBase64: string): Promise<string> {
  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4.6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
              {
                type: "text",
                text: "Опиши товар на этой фотографии в 1-2 предложениях для поиска на маркетплейсе. Укажи тип товара, материал, цвет, ключевые особенности. Без лишних слов — только описание.",
              },
            ],
          },
        ],
      }),
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("Image describe error:", e);
    return "";
  }
}

export async function handleTelegramMessage(
  update: TelegramUpdate,
  agentId: string,
  botToken: string
) {
  const message = update.message;
  if (!message) return;

  const userText = message.text ?? message.caption ?? "";
  const hasPhoto = message.photo && message.photo.length > 0;

  if (!userText && !hasPhoto) return;

  const chatId = message.chat.id;

  const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const me = await meRes.json();
  const botUsername = me.result?.username;

  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";

  if (isGroup && botUsername) {
    const mention = `@${botUsername}`.toLowerCase();
    const mentioned = userText.toLowerCase().includes(mention);
    const repliedToBot = message.reply_to_message?.from?.username === botUsername;

    if (!mentioned && !repliedToBot) {
      return;
    }
  }

  if (userText === "/start" || userText.startsWith("/start@")) {
    const agent = getAgent(agentId);
    await sendTelegramMessage(botToken, chatId, agent?.greeting ?? "Привет!");
    return;
  }

  const agent = getAgent(agentId);
  if (!agent) {
    await sendTelegramMessage(botToken, chatId, "Агент не найден");
    return;
  }

  const cleanText = botUsername
    ? userText.replace(new RegExp(`@${botUsername}`, "gi"), "").trim()
    : userText;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    let photoDescription = "";
    if (hasPhoto) {
      const largestPhoto = message.photo![message.photo!.length - 1];
      const base64 = await getPhotoBase64(largestPhoto.file_id, botToken);
      if (base64) {
        photoDescription = await describeImage(base64);
      }
    }

    const finalQuery = [photoDescription, cleanText].filter(Boolean).join(". ");

    let extraContext = "";
    let ozonReportPeriod: { from: string; to: string } | null = null;

    // Если это Финн и вопрос про деньги — тянем отчёт Ozon
    if (agentId === "cfo-finn" && needsOzonReport(finalQuery)) {
      try {
        const period = extractPeriod(finalQuery);
        ozonReportPeriod = period;
        const report = await getOzonReport(period.from, period.to);
        if (report.summary) {
          extraContext = `\n\n[LIVE OZON DATA for period ${report.period.from} to ${report.period.to}]
Выручка: ${report.summary.totalRevenue} ₽
Комиссии маркетплейса: ${report.summary.totalCommissions} ₽
Логистика: ${report.summary.totalLogistics} ₽
Возвраты: ${report.summary.totalReturns} ₽
Чистая прибыль до расходов: ${report.summary.netProfit} ₽
Заказов доставлено: ${report.summary.ordersCount}
Возвратов: ${report.summary.returnsCount}

Используй эти реальные цифры из Ozon API в своём ответе. В конце обязательно напиши: "📎 Excel с детализацией отправлен отдельным файлом". Помни — это только маркетплейс, без учёта твоих внутренних расходов (зарплата, аренда, материалы и т.д.).`;
        }
      } catch (e) {
        console.error("Ozon report failed:", e);
      }
    }

    // Если это Лин — делаем поиск
    if (agentId === "scout-lin" && finalQuery) {
      const platform = detectPlatform(finalQuery);
      try {
        const results = await searchProducts(finalQuery, platform);
        if (results.length > 0) {
          extraContext = `\n\nSearch results from ${platform}:\n` +
            results.map((r: { title: string; url: string; content: string }, i: number) =>
              `${i + 1}. ${r.title}\nURL: ${r.url}\nОписание: ${r.content?.slice(0, 200)}`
            ).join("\n\n");
        }
        if (photoDescription) {
          extraContext += `\n\n[Photo was analyzed as: ${photoDescription}]`;
        }
      } catch (e) {
        console.error("Search failed:", e);
      }
    }

    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4.6",
        max_tokens: 1500,
        messages: [
          { role: "system", content: agent.systemPrompt + extraContext },
          { role: "user", content: finalQuery || "Проанализируй присланное фото" },
        ],
      }),
    });

    const data = await res.json();
    const response = data.choices?.[0]?.message?.content ?? "Не смог ответить, попробуй ещё раз.";

    await sendTelegramMessage(botToken, chatId, response);

    // Если Финн составлял отчёт — отправляем Excel файлом
    if (ozonReportPeriod) {
      await sendOzonExcel(botToken, chatId, ozonReportPeriod.from, ozonReportPeriod.to);
    }

    if (agentId === "accountant-tanya") {
      const expense = extractExpenseData(cleanText);
      if (expense) {
        try {
          await fetch(`https://ai-team-42mz.vercel.app/api/sheets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(expense),
          });
        } catch (e) {
          console.error("Sheets error:", e);
        }
      }
    }

  } catch (error) {
    console.error("Telegram handler error:", error);
    await sendTelegramMessage(botToken, chatId, "Произошла ошибка, попробуй позже.");
  }
}

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

function extractExpenseData(text: string) {
  const amountMatch = text.match(/(\d[\d\s,]*(?:\.\d+)?)\s*([кkтtмm]{1,2})?[\s]*(?:р(?:уб)?\.?|₽)?/i);
  if (!amountMatch || !amountMatch[1]) return null;

  const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
  let date: string;
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3]
      ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3])
      : new Date().getFullYear();
    date = `${day}.${month}.${year}`;
  } else {
    date = new Date().toLocaleDateString("ru-RU");
  }

  let amount = parseFloat(amountMatch[1].replace(/[\s,]/g, ""));
  const suffix = amountMatch[2]?.toLowerCase() ?? "";
  if (suffix === "кк" || suffix === "kk") amount *= 1_000_000;
  else if (suffix === "к" || suffix === "k" || suffix === "т" || suffix === "t") amount *= 1_000;
  else if (suffix === "м" || suffix === "m") amount *= 1_000_000;

  if (isNaN(amount) || amount <= 0) return null;

  const t = text.toLowerCase();
  let category = "прочее";
  if (t.match(/зп|зарплат|оклад|выплат/)) category = "зарплата";
  else if (t.match(/аренд/)) category = "аренда";
  else if (t.match(/короб|стрейч|плёнк|пленк|этикет|скотч|материал/)) category = "материалы";
  else if (t.match(/упаков/)) category = "упаковка";
  else if (t.match(/закуп|поставщик|китай|рынок/)) category = "закупки";
  else if (t.match(/логистик|фрахт|карго|груз/)) category = "логистика";
  else if (t.match(/курьер|вб|wb|озон|ozon|яндекс|сдэк|cdek|доставк/)) category = "доставка";
  else if (t.match(/бартер/)) category = "бартеры";
  else if (t.match(/реклам|блогер|маркетинг/)) category = "реклама";

  return {
    date,
    amount: String(Math.round(amount)),
    category,
    description: text,
  };
}