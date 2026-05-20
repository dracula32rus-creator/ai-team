import { NextRequest, NextResponse } from "next/server";
import {
  searchWbSubjects,
  searchOzNiches,
  getWbNicheData,
  getOzNicheData,
  detectMarket,
} from "@/lib/mpstats";

function detectCategory(text: string): string {
  const t = text.toLowerCase();
  if (t.match(/зп|зарплат|оклад|выплат/)) return "зарплата";
  if (t.match(/аренд/)) return "аренда";
  if (t.match(/короб|стрейч|плёнк|пленк|этикет|скотч|материал/)) return "материалы";
  if (t.match(/упаков/)) return "упаковка";
  if (t.match(/закуп|поставщик|китай|рынок/)) return "закупки";
  if (t.match(/логистик|фрахт|карго|груз/)) return "логистика";
  if (t.match(/курьер|вб|wb|озон|ozon|яндекс|сдэк|cdek|доставк/)) return "доставка";
  if (t.match(/бартер/)) return "бартеры";
  if (t.match(/реклам|блогер|маркетинг/)) return "реклама";
  return "прочее";
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

  return {
    date,
    amount: String(Math.round(amount)),
    category: detectCategory(text),
    description: text,
  };
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

function formatMpstatsContext(data: Record<string, unknown>): string {
  if (!data || data.error) return "";

  const subject = data.subject as Record<string, unknown>;
  const info = (data.info ?? data) as Record<string, unknown>;
  const sellers = (data.sellers ?? []) as Record<string, unknown>[];
  const brands = (data.brands ?? []) as Record<string, unknown>[];
  const priceSegments = (data.priceSegments ?? []) as Record<string, unknown>[];
  const trends = (data.trends ?? []) as Record<string, unknown>[];
  const period = data.period as Record<string, string>;
  const market = data.market as string;
  const marketLabel = market === "wb" ? "Wildberries" : market === "oz" ? "Ozon" : "";

  let ctx = `\n\n[LIVE MPSTATS DATA — ${marketLabel} — Ниша: "${subject?.name}" за период ${period?.d1} — ${period?.d2}]\n\n`;

  if (info) {
    ctx += `📊 ОСНОВНЫЕ ПОКАЗАТЕЛИ НИШИ (${marketLabel}):\n`;
    ctx += `• Выручка: ${info.revenue ? Number(info.revenue).toLocaleString("ru-RU") : "—"} ₽\n`;
    ctx += `• Продажи: ${info.sales ?? "—"} шт\n`;
    ctx += `• Товаров в нише: ${info.items ?? info.items_count ?? "—"}\n`;
    ctx += `• Продавцов: ${info.sellers_count ?? info.sellers ?? "—"}\n`;
    ctx += `• Брендов: ${info.brands_count ?? info.brands ?? "—"}\n`;
    ctx += `• Средняя цена: ${(info.avg_price ?? info.avg_price_final) ? Number(info.avg_price ?? info.avg_price_final).toLocaleString("ru-RU") : "—"} ₽\n\n`;
  }

  if (sellers?.length) {
    ctx += `🏆 ТОП-5 ПРОДАВЦОВ (${marketLabel}):\n`;
    const totalRev = sellers.reduce((sum, s) => sum + Number(s.revenue ?? 0), 0);
    sellers.slice(0, 5).forEach((s, i) => {
      const revenue = Number(s.revenue ?? 0);
      const share = s.revenue_share ?? (totalRev > 0 ? ((revenue / totalRev) * 100).toFixed(1) : "—");
      ctx += `${i + 1}. ${s.name ?? s.seller} — выручка: ${revenue.toLocaleString("ru-RU")} ₽, продажи: ${s.sales ?? "—"} шт, доля: ${share}%\n`;
    });

    if (sellers.length >= 3) {
      const top3Rev = sellers.slice(0, 3).reduce((sum, s) => sum + Number(s.revenue ?? 0), 0);
      const top3Share = totalRev > 0 ? (top3Rev / totalRev) * 100 : 0;
      ctx += `\n⚠️ МОНОПОЛИЗАЦИЯ: Топ-3 занимают ${top3Share.toFixed(1)}% рынка`;
      if (top3Share > 60) ctx += " — рынок ВЫСОКО монополизирован";
      else if (top3Share > 40) ctx += " — рынок умеренно монополизирован";
      else ctx += " — рынок конкурентный, есть место для входа";
      ctx += "\n\n";
    }
  }

  if (brands?.length) {
    ctx += `🏷️ ТОП-5 БРЕНДОВ (${marketLabel}):\n`;
    brands.slice(0, 5).forEach((b, i) => {
      ctx += `${i + 1}. ${b.name ?? b.brand} — выручка: ${b.revenue ? Number(b.revenue).toLocaleString("ru-RU") : "—"} ₽\n`;
    });
    ctx += "\n";
  }

  if (priceSegments?.length) {
    ctx += `💰 ЦЕНОВАЯ СЕГМЕНТАЦИЯ (${marketLabel}):\n`;
    priceSegments.forEach((seg) => {
      const from = seg.price_from ?? seg.min_range_price ?? seg.min_price ?? "?";
      const to = seg.price_to ?? seg.max_range_price ?? seg.max_price ?? "?";
      ctx += `• ${from}–${to} ₽: ${seg.items_count ?? seg.items ?? "—"} тов, выручка ${seg.revenue ? Number(seg.revenue).toLocaleString("ru-RU") : "—"} ₽\n`;
    });
    ctx += "\n";
  }

  if (trends?.length) {
    const first = trends[0] as Record<string, unknown>;
    const last = trends[trends.length - 1] as Record<string, unknown>;
    const r1 = Number(first?.revenue ?? 0);
    const r2 = Number(last?.revenue ?? 0);
    const pct = r1 > 0 ? (((r2 - r1) / r1) * 100).toFixed(1) : "—";
    ctx += `📈 ТРЕНД (${marketLabel}): ${Number(pct) > 0 ? "↑ Растущая" : "↓ Падающая"} ниша (${pct}% за период)\n\n`;
  }

  ctx += `Используй эти РЕАЛЬНЫЕ данные из MPStats. Сделай структурированный отчёт с таблицами в markdown.`;
  return ctx;
}

export async function POST(req: NextRequest) {
  const { messages, systemPrompt, agentId } = await req.json();
  let extraContext = "";

  // Финн — Ozon отчёт
  if (agentId === "cfo-finn") {
    const lastUserMessage = messages[messages.length - 1]?.content ?? "";
    if (needsOzonReport(lastUserMessage)) {
      try {
        const period = extractPeriod(lastUserMessage);
        const report = await getOzonReport(period.from, period.to);
        if (report.summary) {
          extraContext = `\n\n[LIVE OZON DATA for period ${report.period.from} to ${report.period.to}]
Выручка: ${report.summary.totalRevenue} ₽
Комиссии: ${report.summary.totalCommissions} ₽
Логистика: ${report.summary.totalLogistics} ₽
Возвраты: ${report.summary.totalReturns} ₽
Чистая прибыль: ${report.summary.netProfit} ₽
Заказов: ${report.summary.ordersCount}
Возвратов: ${report.summary.returnsCount}`;
        }
      } catch (e) { console.error("Ozon report failed:", e); }
    }
  }

  // Нова — MPStats напрямую через lib
  if (agentId === "buyer-nova") {
    const lastUserMessage = messages[messages.length - 1]?.content ?? "";
    const choiceMatch = lastUserMessage.trim().match(/^[1-8]$/);
    const prevAssistantMsg = messages.length >= 2 ? (messages[messages.length - 2]?.content ?? "") : "";

    if (choiceMatch && prevAssistantMsg.includes("MPStats_SUBJECTS:")) {
      try {
        const jsonMatch = prevAssistantMsg.match(/MPStats_SUBJECTS:([\s\S]+?)MPStats_END/);
        if (jsonMatch) {
          const subjects = JSON.parse(jsonMatch[1]);
          const chosen = subjects[parseInt(choiceMatch[0]) - 1];
          if (chosen) {
            console.log("=== Nova: loading niche data for", chosen.name, chosen.market);
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const d2 = yesterday.toISOString().split("T")[0];
            const d1 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

            const data = chosen.market === "wb"
              ? await getWbNicheData(Number(chosen.id))
              : await getOzNicheData(Number(chosen.id));
            extraContext = formatMpstatsContext({
              ...data,
              subject: chosen,
              market: chosen.market,
              period: { d1, d2 },
            });
          }
        }
      } catch (e) { console.error("Nova choice error:", e); }
    } else {
      try {
        console.log("=== Nova: searching niches for:", lastUserMessage);
        const market = detectMarket(lastUserMessage);
        let subjects: { id: unknown; name: unknown; market: string }[] = [];

        if (market === "wb") {
          subjects = await searchWbSubjects(lastUserMessage);
        } else if (market === "oz") {
          subjects = await searchOzNiches(lastUserMessage);
        } else {
          const [wb, oz] = await Promise.all([
            searchWbSubjects(lastUserMessage),
            searchOzNiches(lastUserMessage),
          ]);
          subjects = [...wb.slice(0, 4), ...oz.slice(0, 4)];
        }

        console.log("=== Nova: found subjects:", subjects.length);

        if (subjects.length > 0) {
          const marketLabel = market === "wb" ? "WB" : market === "oz" ? "Ozon" : "WB + Ozon";
          const list = subjects.map((s, i) => `${i + 1}. [${String(s.market).toUpperCase()}] ${s.name}`).join("\n");
          extraContext = `\n\n[MPStats нашла ниши по запросу "${lastUserMessage}" (${marketLabel}):]
${list}

MPStats_SUBJECTS:${JSON.stringify(subjects)}MPStats_END

Выведи этот список красиво с номерами. Попроси выбрать цифрой. Не анализируй — жди выбора.`;
        } else {
          extraContext = `\n\n[MPStats не нашла нишу. Попроси уточнить запрос — использовать конкретное русское слово.]`;
        }
      } catch (e) {
        console.error("Nova MPStats error:", e);
      }
    }
  }

  // Лин — поиск товаров
  if (agentId === "scout-lin") {
    const lastUserMessage = messages[messages.length - 1]?.content ?? "";
    const platform = detectPlatform(lastUserMessage);
    try {
      const results = await searchProducts(lastUserMessage, platform);
      if (results.length > 0) {
        extraContext = `\n\nSearch results from ${platform}:\n` +
          results.map((r: { title: string; url: string; content: string }, i: number) =>
            `${i + 1}. ${r.title}\nURL: ${r.url}\nОписание: ${r.content?.slice(0, 200)}`
          ).join("\n\n");
      }
    } catch (e) { console.error("Search failed:", e); }
  }

  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4.6",
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt + extraContext },
        ...messages,
      ],
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  if (agentId === "accountant-tanya") {
    const lastUserMessage = messages[messages.length - 1]?.content ?? "";
    const expense = extractExpenseData(lastUserMessage);
    if (expense) {
      try {
        await fetch("https://ai-team-42mz.vercel.app/api/sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expense),
        });
      } catch (e) { console.error("Sheets failed:", e); }
    }
  }

  return NextResponse.json({ response: text });
}