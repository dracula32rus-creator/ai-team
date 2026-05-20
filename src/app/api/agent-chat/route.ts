import { NextRequest, NextResponse } from "next/server";

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

async function getMpstatsData(query: string) {
  const res = await fetch("https://ai-team-42mz.vercel.app/api/mpstats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return await res.json();
}

async function getMpstatsAnalysis(subjectId: number, market: string) {
  const res = await fetch("https://ai-team-42mz.vercel.app/api/mpstats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjectId, subjectMarket: market }),
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
    ctx += `• Продажи: ${info.sales ?? info.sales ?? "—"} шт\n`;
    ctx += `• Товаров в нише: ${info.items ?? info.items_count ?? "—"}\n`;
    ctx += `• Продавцов: ${info.sellers_count ?? info.sellers ?? "—"}\n`;
    ctx += `• Брендов: ${info.brands_count ?? info.brands ?? "—"}\n`;
    ctx += `• Средняя цена: ${info.avg_price ?? info.avg_price_final ? Number(info.avg_price ?? info.avg_price_final).toLocaleString("ru-RU") : "—"} ₽\n\n`;
  }

  if (sellers?.length) {
    ctx += `🏆 ТОП-5 ПРОДАВЦОВ (${marketLabel}):\n`;
    sellers.slice(0, 5).forEach((s, i) => {
      const revenue = Number(s.revenue ?? 0);
      const totalRevenue = sellers.slice(0, 5).reduce((sum, x) => sum + Number(x.revenue ?? 0), 0);
      const share = totalRevenue > 0 ? ((revenue / totalRevenue) * 100).toFixed(1) : "—";
      ctx += `${i + 1}. ${s.name ?? s.seller} — выручка: ${revenue.toLocaleString("ru-RU")} ₽, продажи: ${s.sales ?? "—"} шт, доля: ${s.revenue_share ?? share}%\n`;
    });

    if (sellers.length >= 3) {
      const totalRev = sellers.reduce((sum, s) => sum + Number(s.revenue ?? 0), 0);
      const top3Rev = sellers.slice(0, 3).reduce((sum, s) => sum + Number(s.revenue ?? 0), 0);
      const top3Share = sellers[0]?.revenue_share
        ? sellers.slice(0, 3).reduce((sum, s) => sum + Number(s.revenue_share ?? 0), 0)
        : totalRev > 0 ? (top3Rev / totalRev) * 100 : 0;

      ctx += `\n⚠️ МОНОПОЛИЗАЦИЯ: Топ-3 продавца занимают ${top3Share.toFixed(1)}% рынка`;
      if (top3Share > 60) ctx += " — рынок ВЫСОКО монополизирован, сложно зайти";
      else if (top3Share > 40) ctx += " — рынок умеренно монополизирован";
      else ctx += " — рынок конкурентный, есть место для новых игроков";
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
      const revenue = seg.revenue ? Number(seg.revenue).toLocaleString("ru-RU") : "—";
      const items = seg.items_count ?? seg.items ?? "—";
      const share = seg.revenue_share ?? "—";
      ctx += `• ${from}–${to} ₽: ${items} тов, выручка ${revenue} ₽, доля ${share}%\n`;
    });
    ctx += "\n";
  }

  if (trends?.length) {
    const first = trends[0] as Record<string, unknown>;
    const last = trends[trends.length - 1] as Record<string, unknown>;
    const revenueFirst = Number(first?.revenue ?? 0);
    const revenueLast = Number(last?.revenue ?? 0);
    const trendPct = revenueFirst > 0 ? (((revenueLast - revenueFirst) / revenueFirst) * 100).toFixed(1) : "—";
    ctx += `📈 ТРЕНД (${marketLabel}): ${Number(trendPct) > 0 ? "↑ Растущая" : "↓ Падающая"} ниша (${trendPct}% за период)\n\n`;
  }

  ctx += `Используй эти РЕАЛЬНЫЕ данные из MPStats для анализа. Сделай структурированный отчёт с таблицами в markdown формате.`;
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
Комиссии маркетплейса: ${report.summary.totalCommissions} ₽
Логистика: ${report.summary.totalLogistics} ₽
Возвраты: ${report.summary.totalReturns} ₽
Чистая прибыль до расходов: ${report.summary.netProfit} ₽
Заказов доставлено: ${report.summary.ordersCount}
Возвратов: ${report.summary.returnsCount}

Используй эти реальные цифры из Ozon API в своём ответе.`;
        }
      } catch (e) {
        console.error("Ozon report failed:", e);
      }
    }
  }

  // Нова — MPStats анализ ниши (двухшаговый)
  if (agentId === "buyer-nova") {
    const lastUserMessage = messages[messages.length - 1]?.content ?? "";
    const choiceMatch = lastUserMessage.trim().match(/^[1-8]$/);
    const prevAssistantMsg = messages.length >= 2
      ? (messages[messages.length - 2]?.content ?? "")
      : "";

    if (choiceMatch && prevAssistantMsg.includes("MPStats_SUBJECTS:")) {
      // Пользователь выбрал нишу из списка
      try {
        const jsonMatch = prevAssistantMsg.match(/MPStats_SUBJECTS:([\s\S]+?)MPStats_END/);
        if (jsonMatch) {
          const subjects = JSON.parse(jsonMatch[1]);
          const chosen = subjects[parseInt(choiceMatch[0]) - 1];
          if (chosen) {
            const analysis = await getMpstatsAnalysis(Number(chosen.id), chosen.market);
            if (analysis?.data) {
              extraContext = formatMpstatsContext({
                ...analysis.data,
                subject: chosen,
                market: chosen.market,
                period: analysis.period,
              });
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse subjects choice:", e);
      }
    } else {
      // Первый запрос — ищем ниши
      try {
        const mpstatsData = await getMpstatsData(lastUserMessage);

        if (mpstatsData.type === "search" && mpstatsData.subjects?.length) {
          const marketLabel = mpstatsData.market === "wb" ? "WB" : mpstatsData.market === "oz" ? "Ozon" : "WB + Ozon";
          const list = mpstatsData.subjects
            .map((s: { name: string; market: string }, i: number) =>
              `${i + 1}. [${s.market.toUpperCase()}] ${s.name}`
            ).join("\n");

          extraContext = `\n\n[MPStats нашла следующие ниши по запросу "${mpstatsData.query}" (${marketLabel}):]
${list}

MPStats_SUBJECTS:${JSON.stringify(mpstatsData.subjects)}MPStats_END

Выведи пользователю этот список ниш красиво с номерами и маркетом в скобках. Попроси выбрать цифрой. Не анализируй сам — жди выбора пользователя. Не задавай лишних вопросов.`;

        } else if (mpstatsData.type === "analysis") {
          extraContext = formatMpstatsContext({
            ...mpstatsData.data,
            market: mpstatsData.market,
            period: mpstatsData.period,
          });

        } else if (mpstatsData.type === "not_found") {
          extraContext = `\n\n[MPStats не нашла нишу по запросу "${mpstatsData.query}". Скажи пользователю что ниша не найдена и попроси уточнить название — использовать более конкретное слово на русском языке.]`;
        }
      } catch (e) {
        console.error("MPStats failed:", e);
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
      } catch (e) {
        console.error("Failed to save expense:", e);
      }
    }
  }

  return NextResponse.json({ response: text });
}