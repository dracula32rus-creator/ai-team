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

async function extractSearchKeyword(text: string): Promise<string> {
  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4.6",
        max_tokens: 20,
        messages: [{
          role: "user",
          content: `Извлеки из фразы ТОЛЬКО название товара или категории для поиска на маркетплейсе. Верни ОДНО-ДВА слова на русском. Без объяснений, только слово(а).

Примеры:
"аналитика по термосам" → термосы
"дай анализ ниши наушники WB" → наушники
"что думаешь про вибраторы" → вибраторы
"аналитика по 18+" → товары для взрослых
"смотрю нишу кроссовки озон" → кроссовки
"анализ ниши книги" → книги
"посмотри термосы на вб" → термосы

Фраза: "${text}"`,
        }],
      }),
    });
    const data = await res.json();
    const keyword = data.choices?.[0]?.message?.content?.trim() ?? "";
    console.log("=== Extracted keyword:", keyword, "from:", text);
    return keyword.length > 1 ? keyword : text;
  } catch (e) {
    console.error("Keyword extraction failed:", e);
    return text;
  }
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
    const last = trends[trends.length - 1] as Record<string, unknown>;
    const first = trends[0] as Record<string, unknown>;
    const r1 = Number(first?.revenue ?? 0);
    const r2 = Number(last?.revenue ?? 0);
    const pct = r1 > 0 ? (((r2 - r1) / r1) * 100).toFixed(1) : "—";
    ctx += `ТРЕНД (12 мес): ${Number(pct) > 0 ? "↑ Растущая" : "↓ Падающая"} ниша (${pct}%)\n\n`;
  }

  ctx += `Используй эти РЕАЛЬНЫЕ данные из MPStats. Сделай структурированный отчёт с таблицами. Дай итоговую оценку — заходить или нет, лучший ценовой сегмент.`;
  return ctx;
}

function buildTrendSvg(trends: Record<string, unknown>[]): string {
  const last12 = trends.slice(-12);
  if (last12.length < 2) return "";

  const revenues = last12.map(t => Number(t.revenue ?? 0));
  const maxRev = Math.max(...revenues);
  const minRev = Math.min(...revenues);
  const range = maxRev - minRev || 1;

  const W = 700;
  const H = 220;
  const padL = 70;
  const padR = 20;
  const padT = 20;
  const padB = 45;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const points = last12.map((t, i) => {
    const x = padL + (i / (last12.length - 1)) * chartW;
    const y = padT + chartH - ((Number(t.revenue ?? 0) - minRev) / range) * chartH;
    return { x, y, revenue: Number(t.revenue ?? 0), label: String(t.label_date ?? "") };
  });

  const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPoints = `${padL},${padT + chartH} ` + points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + ` ${padL + chartW},${padT + chartH}`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const y = padT + chartH - ratio * chartH;
    const val = ((minRev + ratio * range) / 1_000_000).toFixed(1);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + chartW}" y2="${y.toFixed(1)}" stroke="#2a2a2a" stroke-width="1"/>
<text x="${(padL - 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="#666" font-size="11" text-anchor="end">${val}м</text>`;
  }).join("\n");

  const labels = points.map((p, i) => {
    if (i % 2 !== 0 && i !== points.length - 1) return "";
    return `<text x="${p.x.toFixed(1)}" y="${(padT + chartH + 20).toFixed(1)}" fill="#888" font-size="11" text-anchor="middle">${p.label}</text>`;
  }).join("\n");

  const dots = points.map(p => {
    const revM = (p.revenue / 1_000_000).toFixed(1);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="#ff6b3d" stroke="#1a1a1a" stroke-width="2">
  <title>${p.label}: ${revM}м ₽</title>
</circle>`;
  }).join("\n");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;height:auto;display:block">
  <defs>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff6b3d" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#ff6b3d" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${gridLines}
  <polygon points="${areaPoints}" fill="url(#areaGrad)"/>
  <polyline points="${polyline}" fill="none" stroke="#ff6b3d" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  ${labels}
</svg>`;
}

function generateNovaHtmlReport(markdown: string, nicheName: string, trendsWb?: Record<string, unknown>[], trendsOz?: Record<string, unknown>[]): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const wbChart = trendsWb && trendsWb.length >= 2 ? buildTrendSvg(trendsWb) : "";
  const ozChart = trendsOz && trendsOz.length >= 2 ? buildTrendSvg(trendsOz) : "";

  const chartsHtml = [
    wbChart ? `<div class="trend-card"><h2>📈 Тренд выручки WB (12 мес)</h2><div class="svg-wrap">${wbChart}</div></div>` : "",
    ozChart ? `<div class="trend-card"><h2>📈 Тренд выручки Ozon (12 мес)</h2><div class="svg-wrap">${ozChart}</div></div>` : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Анализ ниши: ${nicheName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e8e8e8; padding: 24px; max-width: 900px; margin: 0 auto; }
  .header { background: linear-gradient(135deg, #993C1D, #c4522a); border-radius: 16px; padding: 28px 32px; margin-bottom: 20px; }
  .header h1 { font-size: 26px; font-weight: 700; color: white; margin-bottom: 6px; }
  .header .meta { font-size: 13px; color: rgba(255,255,255,0.7); }
  .card, .trend-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 22px; margin-bottom: 14px; }
  .svg-wrap { overflow-x: auto; margin-top: 8px; }
  h2 { font-size: 17px; font-weight: 600; color: #ff6b3d; margin-bottom: 14px; border-bottom: 1px solid #2a2a2a; padding-bottom: 8px; }
  h3 { font-size: 14px; font-weight: 600; color: #e8e8e8; margin: 14px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  th { background: #222; color: #888; font-weight: 500; padding: 9px 12px; text-align: left; border-bottom: 1px solid #333; }
  td { padding: 9px 12px; border-bottom: 1px solid #1f1f1f; color: #ddd; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #1e1e1e; }
  p { color: #bbb; line-height: 1.65; margin: 6px 0; font-size: 14px; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .badge-green { background: #1a3a1a; color: #4caf50; border: 1px solid #4caf50; }
  .badge-red { background: #3a1a1a; color: #f44336; border: 1px solid #f44336; }
  .badge-yellow { background: #3a3a1a; color: #ff9800; border: 1px solid #ff9800; }
  .verdict { border-radius: 10px; padding: 18px; margin-top: 12px; border: 1px solid #4caf50; background: #111e11; }
  .verdict.bad { border-color: #f44336; background: #1e1111; }
  .verdict.neutral { border-color: #ff9800; background: #1e1a11; }
  .verdict h3 { color: #4caf50; margin: 0 0 6px; }
  .verdict.bad h3 { color: #f44336; }
  .verdict.neutral h3 { color: #ff9800; }
  .footer { text-align: center; color: #444; font-size: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #1f1f1f; }
  strong { color: #fff; }
  ul { padding-left: 18px; }
  li { color: #bbb; line-height: 1.8; font-size: 13px; }
  blockquote { border-left: 3px solid #993C1D; padding-left: 14px; margin: 10px 0; color: #999; font-style: italic; font-size: 14px; }
</style>
</head>
<body>
<div class="header">
  <h1>📊 ${nicheName}</h1>
  <div class="meta">Анализ ниши MPStats · ${dateStr}</div>
</div>
${chartsHtml}
<div id="content">${convertMarkdownToHtml(markdown)}</div>
<div class="footer">Powered by MPStats · AI Team WB/Ozon · ${dateStr}</div>
</body>
</html>`;
}

function convertMarkdownToHtml(md: string): string {
  const lines = md.split("\n");
  let html = "";
  let inTable = false;
  let inCard = false;
  let tableRows = "";
  let tableHeader = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (inTable) { html += buildTable(tableHeader, tableRows); inTable = false; tableRows = ""; tableHeader = ""; }
      if (inCard) { html += "</div>"; inCard = false; }
      html += `<div class="card"><h2>${line.replace("## ", "")}</h2>`;
      inCard = true;
      continue;
    }
    if (line.startsWith("### ")) {
      if (inTable) { html += buildTable(tableHeader, tableRows); inTable = false; tableRows = ""; tableHeader = ""; }
      html += `<h3>${line.replace("### ", "")}</h3>`;
      continue;
    }
    if (line.startsWith("|")) {
      if (line.includes("---")) continue;
      if (!inTable) { inTable = true; tableHeader = line; }
      else tableRows += line + "\n";
      continue;
    } else if (inTable) {
      html += buildTable(tableHeader, tableRows);
      inTable = false; tableRows = ""; tableHeader = "";
    }
    if (line.includes("ЗАХОДИМ") && !line.includes("НЕ ЗАХОДИМ")) {
      html += `<div class="verdict"><h3>✅ ЗАХОДИМ 🔥</h3><p>${formatInline(line)}</p></div>`;
      continue;
    }
    if (line.includes("НЕ ЗАХОДИМ")) {
      html += `<div class="verdict bad"><h3>🚫 НЕ ЗАХОДИМ</h3><p>${formatInline(line)}</p></div>`;
      continue;
    }
    if (line.includes("ДУМАЕМ")) {
      html += `<div class="verdict neutral"><h3>🤔 ДУМАЕМ</h3><p>${formatInline(line)}</p></div>`;
      continue;
    }
    if (line.startsWith("> ")) { html += `<blockquote>${formatInline(line.replace("> ", ""))}</blockquote>`; continue; }
    if (line.startsWith("- ") || line.startsWith("* ")) { html += `<ul><li>${formatInline(line.replace(/^[-*] /, ""))}</li></ul>`; continue; }
    if (line.startsWith("---")) continue;
    if (line.trim()) html += `<p>${formatInline(line)}</p>`;
  }

  if (inTable) html += buildTable(tableHeader, tableRows);
  if (inCard) html += "</div>";
  return html;
}

function buildTable(header: string, rows: string): string {
  const headers = header.split("|").filter(h => h.trim()).map(h => `<th>${h.trim()}</th>`).join("");
  const bodyRows = rows.trim().split("\n").filter(r => r.trim() && !r.includes("---")).map(row => {
    const cells = row.split("|").filter(c => c.trim()).map(c => `<td>${formatInline(c.trim())}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/🟢/g, '<span class="badge badge-green">🟢 Хорошо</span>')
    .replace(/🔴/g, '<span class="badge badge-red">🔴 Риск</span>')
    .replace(/🟡/g, '<span class="badge badge-yellow">🟡 Средне</span>');
}

async function sendNovaHtmlReport(botToken: string, chatId: number, html: string, nicheName: string): Promise<void> {
  try {
    const fileName = `nova-${nicheName.replace(/[^а-яёa-z0-9]/gi, "-").toLowerCase()}-${Date.now()}.html`;
    const buffer = Buffer.from(html, "utf-8");
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("caption", `📊 Анализ ниши: ${nicheName}`);
    formData.append("document", new Blob([buffer], { type: "text/html" }), fileName);
    await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: "POST", body: formData });
  } catch (e) {
    console.error("Nova HTML report send error:", e);
  }
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
    let novaSubjectName = "";
    let novaWbTrends: Record<string, unknown>[] = [];
    let novaOzTrends: Record<string, unknown>[] = [];

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

    if (agentId === "buyer-nova" && finalQuery) {
      try {
        const queryToUse = await extractSearchKeyword(finalQuery);
        console.log("=== Nova TG: original:", finalQuery);
        console.log("=== Nova TG: extracted keyword:", queryToUse);

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

        if (subjects.length > 0) {
          const first = subjects[0];
          novaSubjectName = queryToUse;

          const nicheData = first.market === "wb"
            ? await getWbNicheData(Number(first.id))
            : await getOzNicheData(Number(first.id));

          if (first.market === "wb") novaWbTrends = nicheData.trends as Record<string, unknown>[];
          else novaOzTrends = nicheData.trends as Record<string, unknown>[];

          extraContext = "\n\n" + formatMpstatsForTelegram({ ...nicheData, market: first.market }, String(first.name));

          if (market === "both" && subjects.length > 1) {
            const second = subjects.find(s => s.market !== first.market);
            if (second) {
              const secondData = second.market === "wb"
                ? await getWbNicheData(Number(second.id))
                : await getOzNicheData(Number(second.id));
              if (second.market === "wb") novaWbTrends = secondData.trends as Record<string, unknown>[];
              else novaOzTrends = secondData.trends as Record<string, unknown>[];
              extraContext += "\n\n" + formatMpstatsForTelegram({ ...secondData, market: second.market }, String(second.name));
            }
          }
        } else {
          extraContext = `\n\n[MPStats не нашла нишу по запросу "${queryToUse}". Попроси написать конкретное название товара.]`;
        }
      } catch (e) {
        console.error("Nova MPStats TG error:", e);
      }
    }

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
        max_tokens: agentId === "buyer-nova" ? 4000 : 1500,
        messages: [
          { role: "system", content: agent.systemPrompt + extraContext },
          { role: "user", content: finalQuery || "Проанализируй присланное фото" },
        ],
      }),
    });

    const data = await res.json();
    const response = data.choices?.[0]?.message?.content ?? "Не смог ответить, попробуй ещё раз.";

    if (agentId === "buyer-nova" && novaSubjectName) {
      const shortMsg = `📊 Анализ ниши *${novaSubjectName}* готов — смотри файл ниже 👇`;
      await sendTelegramMessage(botToken, chatId, shortMsg);
      const html = generateNovaHtmlReport(response, novaSubjectName, novaWbTrends, novaOzTrends);
      await sendNovaHtmlReport(botToken, chatId, html, novaSubjectName);
    } else {
      await sendTelegramMessage(botToken, chatId, response);
    }

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