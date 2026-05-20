import { getAgent } from "@/config/agents";
import {
  searchWbSubjects,
  searchOzNiches,
  getWbNicheData,
  getOzNicheData,
  detectMarket,
} from "@/lib/mpstats";

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
    t.match(/озон|ozon|маркетплейс|период|месяц|неделя|квартал|год|сегодня|вчера|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр/)
  );
}

function extractPeriod(text: string): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const t = text.toLowerCase();

  const months: Record<string, number> = {
    "январ": 0, "феврал": 1, "март": 2, "апрел": 3,
    "май": 4, "мая": 4, "июн": 5, "июл": 6, "август": 7,
    "сентябр": 8, "октябр": 9, "ноябр": 10, "декабр": 11,
  };

  for (const [key, month] of Object.entries(months)) {
    if (t.includes(key)) {
      const from = new Date(year, month, 1);
      const to = new Date(year, month + 1, 0);
      return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
    }
  }

  if (t.includes("сегодня")) { const today = now.toISOString().split("T")[0]; return { from: today, to: today }; }
  if (t.match(/вчера/)) { const y = new Date(now); y.setDate(y.getDate() - 1); const d = y.toISOString().split("T")[0]; return { from: d, to: d }; }
  if (t.match(/недел/)) { const w = new Date(now); w.setDate(w.getDate() - 7); return { from: w.toISOString().split("T")[0], to: now.toISOString().split("T")[0] }; }
  const m = new Date(now); m.setDate(m.getDate() - 30);
  return { from: m.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
}

async function getOzonReport(dateFrom: string, dateTo: string) {
  const res = await fetch("https://ai-team-42mz.vercel.app/api/ozon/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dateFrom, dateTo }),
  });
  return await res.json();
}

async function sendOzonExcel(botToken: string, chatId: number, dateFrom: string, dateTo: string): Promise<boolean> {
  try {
    const res = await fetch("https://ai-team-42mz.vercel.app/api/ozon/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateFrom, dateTo }),
    });
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    const fileName = `ozon-report-${dateFrom}-${dateTo}.xlsx`;
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("caption", `📊 Отчёт Ozon: ${dateFrom} — ${dateTo}`);
    formData.append("document", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
    const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: "POST", body: formData });
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
    return Buffer.from(arrayBuffer).toString("base64");
  } catch (e) {
    console.error("Photo download error:", e);
    return null;
  }
}

async function describeImage(imageBase64: string): Promise<string> {
  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4.6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            { type: "text", text: "Опиши товар на этой фотографии в 1-2 предложениях для поиска на маркетплейсе. Укажи тип товара, материал, цвет, ключевые особенности. Без лишних слов — только описание." },
          ],
        }],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("Image describe error:", e);
    return "";
  }
}

function cleanSearchQuery(text: string): string {
  return text
    .replace(/анализ ниши|проанализируй нишу|анализ|ниша|ниши|посмотри|изучи|расскажи про|что думаешь про|на маркетплейсе|смотрю нишу|дай анализ|сделай анализ/gi, "")
    .replace(/\bwb\b|\bвб\b|\bozon\b|\bозон\b|\bвайлдберриз\b|\bwildberries\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMpstatsForTelegram(data: Record<string, unknown>, subjectName: string): string {
  const sellers = (data.sellers ?? []) as Record<string, unknown>[];
  const brands = (data.brands ?? []) as Record<string, unknown>[];
  const priceSegments = (data.priceSegments ?? []) as Record<string, unknown>[];
  const trends = (data.trends ?? []) as Record<string, unknown>[];
  const market = data.market as string;
  const marketLabel = market === "wb" ? "Wildberries" : "Ozon";

  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const d2 = yesterday.toISOString().split("T")[0];
  const d1 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  let ctx = `[LIVE MPSTATS DATA — ${marketLabel} — Ниша: "${subjectName}" за период ${d1} — ${d2}]\n\n`;

  if (sellers?.length) {
    ctx += `ТОП-5 ПРОДАВЦОВ (${marketLabel}):\n`;
    const totalRev = sellers.reduce((sum, s) => sum + Number(s.revenue ?? 0), 0);
    sellers.slice(0, 5).forEach((s, i) => {
      const revenue = Number(s.revenue ?? 0);
      const share = totalRev > 0 ? ((revenue / totalRev) * 100).toFixed(1) : "—";
      ctx += `${i + 1}. ${s.name} — ${revenue.toLocaleString("ru-RU")} ₽ (${s.revenue_share ?? share}%)\n`;
    });

    if (sellers.length >= 3) {
      const top3Rev = sellers.slice(0, 3).reduce((sum, s) => sum + Number(s.revenue ?? 0), 0);
      const top3Share = totalRev > 0 ? ((top3Rev / totalRev) * 100).toFixed(1) : "0";
      ctx += `\nМОНОПОЛИЗАЦИЯ: Топ-3 = ${top3Share}% рынка`;
      if (Number(top3Share) > 60) ctx += " — ВЫСОКАЯ";
      else if (Number(top3Share) > 40) ctx += " — СРЕДНЯЯ";
      else ctx += " — НИЗКАЯ, можно заходить";
      ctx += "\n\n";
    }
  }

  if (brands?.length) {
    ctx += `ТОП-5 БРЕНДОВ (${marketLabel}):\n`;
    brands.slice(0, 5).forEach((b, i) => {
      ctx += `${i + 1}. ${b.name} — ${b.revenue ? Number(b.revenue).toLocaleString("ru-RU") : "—"} ₽\n`;
    });
    ctx += "\n";
  }

  if (priceSegments?.length) {
    ctx += `ЦЕНОВАЯ СЕГМЕНТАЦИЯ (${marketLabel}):\n`;
    priceSegments.forEach((seg) => {
      const from = seg.price_from ?? seg.min_range_price ?? "?";
      const to = seg.price_to ?? seg.max_range_price ?? "?";
      ctx += `• ${from}–${to} ₽: выручка ${seg.revenue ? Number(seg.revenue).toLocaleString("ru-RU") : "—"} ₽\n`;
    });
    ctx += "\n";
  }

  if (trends?.length) {
    const first = trends[0] as Record<string, unknown>;
    const last = trends[trends.length - 1] as Record<string, unknown>;
    const r1 = Number(first?.revenue ?? 0);
    const r2 = Number(last?.revenue ?? 0);
    const pct = r1 > 0 ? (((r2 - r1) / r1) * 100).toFixed(1) : "—";
    ctx += `ТРЕНД: ${Number(pct) > 0 ? "↑ Растущая" : "↓ Падающая"} ниша (${pct}% за период)\n\n`;
  }

  ctx += `Используй эти РЕАЛЬНЫЕ данные из MPStats. Сделай структурированный отчёт с таблицами. Дай итоговую оценку — заходить или нет, лучший ценовой сегмент.`;
  return ctx;
}

export async function handleTelegramMessage(update: TelegramUpdate, agentId: string, botToken: string) {
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
    if (!mentioned && !repliedToBot) return;
  }

  if (userText === "/start" || userText.startsWith("/start@")) {
    const agent = getAgent(agentId);
    await sendTelegramMessage(botToken, chatId, agent?.greeting ?? "Привет!");
    return;
  }

  const agent = getAgent(agentId);
  if (!agent) { await sendTelegramMessage(botToken, chatId, "Агент не найден"); return; }

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
      if (base64) photoDescription = await describeImage(base64);
    }

    const finalQuery = [photoDescription, cleanText].filter(Boolean).join(". ");
    let extraContext = "";
    let ozonReportPeriod: { from: string; to: string } | null = null;

    // Финн — Ozon отчёт
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

Используй эти реальные цифры из Ozon API в своём ответе. В конце обязательно напиши: "📎 Excel с детализацией отправлен отдельным файлом".`;
        }
      } catch (e) { console.error("Ozon report failed:", e); }
    }

    // Нова — MPStats анализ ниши
    if (agentId === "buyer-nova" && finalQuery) {
      try {
        // Очищаем запрос от лишних слов
        const searchQuery = cleanSearchQuery(finalQuery);
        const queryToUse = searchQuery.length > 2 ? searchQuery : finalQuery;
        
        console.log("=== Nova TG: original:", finalQuery);
        console.log("=== Nova TG: clean query:", queryToUse);

        const market = detectMarket(finalQuery);
        let subjects: { id: unknown; name: unknown; market: string }[] = [];

        if (market === "wb") {
          subjects = await searchWbSubjects(queryToUse);
        } else if (market === "oz") {
          subjects = await searchOzNiches(queryToUse);
        } else {
          const [wb, oz] = await Promise.all([
            searchWbSubjects(queryToUse),
            searchOzNiches(queryToUse),
          ]);
          subjects = [...wb.slice(0, 3), ...oz.slice(0, 3)];
        }

        console.log("=== Nova TG: found:", subjects.length, "subjects");
        if (subjects.length > 0) console.log("=== Nova TG: first result:", subjects[0].name, subjects[0].market);

        if (subjects.length > 0) {
          const first = subjects[0];
          console.log("=== Nova TG: analyzing:", first.name, first.market);

          const nicheData = first.market === "wb"
            ? await getWbNicheData(Number(first.id))
            : await getOzNicheData(Number(first.id));

          extraContext = "\n\n" + formatMpstatsForTelegram(
            { ...nicheData, market: first.market },
            String(first.name)
          );

          // Если оба маркета — добавляем второй
          if (market === "both" && subjects.length > 1) {
            const second = subjects.find(s => s.market !== first.market);
            if (second) {
              const secondData = second.market === "wb"
                ? await getWbNicheData(Number(second.id))
                : await getOzNicheData(Number(second.id));
              extraContext += "\n\n" + formatMpstatsForTelegram(
                { ...secondData, market: second.market },
                String(second.name)
              );
            }
          }
        } else {
          extraContext = `\n\n[MPStats не нашла нишу по запросу "${queryToUse}". Попроси написать конкретное русское слово — например "термосы" или "наушники".]`;
        }
      } catch (e) {
        console.error("Nova MPStats TG error:", e);
      }
    }

    // Лин — поиск товаров
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
        if (photoDescription) extraContext += `\n\n[Photo was analyzed as: ${photoDescription}]`;
      } catch (e) { console.error("Search failed:", e); }
    }

    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`, "Content-Type": "application/json" },
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

    if (ozonReportPeriod) {
      await sendOzonExcel(botToken, chatId, ozonReportPeriod.from, ozonReportPeriod.to);
    }

    if (agentId === "accountant-tanya") {
      const expense = extractExpenseData(cleanText);
      if (expense) {
        try {
          await fetch("https://ai-team-42mz.vercel.app/api/sheets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(expense),
          });
        } catch (e) { console.error("Sheets error:", e); }
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
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
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
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : new Date().getFullYear();
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

  return { date, amount: String(Math.round(amount)), category, description: text };
}