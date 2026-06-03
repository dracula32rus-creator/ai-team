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
    ctx += `ТРЕНД (${trends.length} мес): ${Number(pct) > 0 ? "↑ Растущая" : "↓ Падающая"} ниша (${pct}%)\n\n`;
  }

  ctx += `Используй эти РЕАЛЬНЫЕ данные из MPStats. Сделай структурированный отчёт с таблицами. Дай итоговую оценку — заходить или нет, лучший ценовой сегмент.`;
  return ctx;
}

// ─── ИНТЕРАКТИВНЫЙ ГРАФИК ТРЕНДА ─────────────────────────────────────────────
// market: "wb" | "oz" — определяет цветовую схему и заголовок
function buildInteractiveTrendChart(
  trends: Record<string, unknown>[],
  market: "wb" | "oz"
): string {
  if (!trends || trends.length < 2) return "";

  const points = trends.map(t => ({
    label: String(t.label_date ?? t.date ?? ""),
    revenue:     Number(t.revenue      ?? t.orders_sum        ?? 0),
    orders:      Number(t.orders       ?? t.purchases         ?? 0),
    buyouts:     Number(t.buyouts      ?? t.buyouts_count     ?? 0),
    buyouts_sum: Number(t.buyouts_sum  ?? t.buyout_revenue    ?? t.revenue_buyouts ?? 0),
  }));

  const dataJson = JSON.stringify(points);
  const marketLabel = market === "wb" ? "Wildberries" : "Ozon";
  // WB — зелёный (#17BF50), Ozon — синий (#185FA5)
  const primaryColor = market === "wb" ? "#17BF50" : "#185FA5";
  const chartId = `tc_${market}_${Date.now()}`;

  return `
<div id="${chartId}_root" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:20px 22px;margin-bottom:16px;">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
    <div>
      <div style="font-size:16px;font-weight:700;color:#e8e8e8;">📈 Тренд ниши ${marketLabel} (4 года)</div>
      <div style="font-size:12px;color:#666;margin-top:2px;">По месяцам · можно выбрать несколько метрик · наведи на точку</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;" id="${chartId}_mtabs">
      <button onclick="${chartId}_toggle('revenue',this)"     id="${chartId}_t_revenue"     class="${chartId}_tab ${chartId}_tab_on" style="border-color:${primaryColor};background:${primaryColor}22;color:${primaryColor};">Сумма заказов</button>
      <button onclick="${chartId}_toggle('orders',this)"      id="${chartId}_t_orders"      class="${chartId}_tab">Кол-во заказов</button>
      <button onclick="${chartId}_toggle('buyouts',this)"     id="${chartId}_t_buyouts"     class="${chartId}_tab">Кол-во выкупов</button>
      <button onclick="${chartId}_toggle('buyouts_sum',this)" id="${chartId}_t_buyouts_sum" class="${chartId}_tab">Сумма выкупов</button>
    </div>
  </div>

  <style>
    .${chartId}_tab {
      background:#222;border:1.5px solid #333;border-radius:7px;
      padding:5px 12px;font-size:12px;font-weight:600;color:#666;
      cursor:pointer;transition:all .15s;
    }
    .${chartId}_tab:hover { border-color:#555; }
    .${chartId}_tab_on { border-color:${primaryColor} !important; background:${primaryColor}22 !important; color:${primaryColor} !important; }
  </style>

  <div style="position:relative;" id="${chartId}_wrap">
    <div id="${chartId}_tt" style="display:none;position:absolute;z-index:20;background:#0f0f0f;color:#e8e8e8;border:1px solid #333;border-radius:9px;padding:10px 14px;font-size:12px;line-height:1.8;pointer-events:none;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.5);"></div>
    <div style="overflow-x:auto;" id="${chartId}_scroll">
      <canvas id="${chartId}_canvas" style="display:block;cursor:crosshair;"></canvas>
    </div>
  </div>
  <div id="${chartId}_legend" style="display:flex;gap:14px;margin-top:10px;font-size:12px;color:#666;flex-wrap:wrap;"></div>
</div>

<script>
(function(){
  var DATA = ${dataJson};
  var PRIMARY = "${primaryColor}";
  var MARKET_LABEL = "${marketLabel}";
  var CID = "${chartId}";

  var METRIC_COLORS = {
    revenue:     PRIMARY,
    orders:      "${market === "wb" ? "#4DF085" : "#54A3E0"}",
    buyouts:     "#BA7517",
    buyouts_sum: "#993C1D",
  };
  var METRIC_LABELS = {
    revenue:"Сумма заказов", orders:"Кол-во заказов",
    buyouts:"Кол-во выкупов", buyouts_sum:"Сумма выкупов",
  };

  var activeMetrics = {"revenue": true};

  var canvas  = document.getElementById(CID+"_canvas");
  var tooltip = document.getElementById(CID+"_tt");
  var legend  = document.getElementById(CID+"_legend");
  var scroll  = document.getElementById(CID+"_scroll");
  var ctx     = canvas.getContext("2d");

  var PAD = {top:24, right:24, bottom:58, left:80};
  var H = 260;

  function fmtV(v, m) {
    if(m==="revenue"||m==="buyouts_sum"){
      if(v>=1e9) return (v/1e9).toFixed(1)+" млрд ₽";
      if(v>=1e6) return (v/1e6).toFixed(1)+" млн ₽";
      if(v>=1e3) return (v/1e3).toFixed(0)+" тыс ₽";
      return v.toLocaleString("ru-RU")+" ₽";
    } else {
      if(v>=1e6) return (v/1e6).toFixed(1)+" млн шт";
      if(v>=1e3) return (v/1e3).toFixed(0)+" тыс шт";
      return v.toLocaleString("ru-RU")+" шт";
    }
  }
  function fmtA(v, m) {
    if(m==="revenue"||m==="buyouts_sum"){
      if(v>=1e9) return (v/1e9).toFixed(1)+"млрд";
      if(v>=1e6) return (v/1e6).toFixed(1)+"млн";
      if(v>=1e3) return (v/1e3).toFixed(0)+"тыс";
      return v.toFixed(0);
    } else {
      if(v>=1e6) return (v/1e6).toFixed(1)+"млн";
      if(v>=1e3) return (v/1e3).toFixed(0)+"тыс";
      return v.toFixed(0);
    }
  }

  function hexToRgb(hex) {
    var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return r+","+g+","+b;
  }

  function getActiveArr() {
    return Object.keys(activeMetrics).filter(function(k){ return activeMetrics[k]; });
  }

  function globalMinMax() {
    var lo=Infinity, hi=0;
    var ms = getActiveArr();
    for(var i=0;i<DATA.length;i++) for(var j=0;j<ms.length;j++){
      var v=Number(DATA[i][ms[j]]||0);
      if(v>hi)hi=v; if(v<lo)lo=v;
    }
    if(hi===0)hi=1; if(lo===Infinity)lo=0;
    return {lo:lo, hi:hi};
  }

  function draw() {
    var labels = DATA.map(function(d){ return d.label; });
    var N = labels.length;
    var colW = Math.max(16, Math.min(36, Math.floor(520/N)));
    var W = PAD.left + N*colW + PAD.right;

    canvas.width=W; canvas.height=H;
    canvas.style.width=W+"px"; canvas.style.height=H+"px";
    ctx.clearRect(0,0,W,H);

    var mm = globalMinMax();
    var lo=mm.lo, hi=mm.hi, range=hi-lo||1;
    var chartH = H-PAD.top-PAD.bottom;
    function toY(v){ return PAD.top+chartH-((v-lo)/range)*chartH; }
    function toX(i){ return PAD.left+i*colW+colW/2; }

    // Grid Y
    var primaryM = getActiveArr()[0] || "revenue";
    ctx.font="11px -apple-system,sans-serif";
    for(var gi=0;gi<=4;gi++){
      var ratio=gi/4, gy=toY(lo+ratio*range);
      ctx.strokeStyle="rgba(255,255,255,0.06)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(PAD.left,gy); ctx.lineTo(W-PAD.right,gy); ctx.stroke();
      ctx.fillStyle="#555"; ctx.textAlign="right";
      ctx.fillText(fmtA(lo+ratio*range, primaryM), PAD.left-6, gy+4);
    }

    // X axis — подписи месяцев и год
    var prevYr="";
    for(var xi=0;xi<N;xi++){
      var lbl=labels[xi], yr=lbl.slice(0,4), mo=lbl.slice(5);
      var xx=toX(xi);
      if(yr!==prevYr){
        ctx.fillStyle="rgba(255,255,255,0.04)";
        ctx.fillRect(xx-colW/2, PAD.top, colW, chartH);
        ctx.font="bold 11px -apple-system,sans-serif"; ctx.fillStyle=PRIMARY; ctx.textAlign="center";
        ctx.fillText(yr, xx, H-PAD.bottom+30);
        prevYr=yr;
      }
      if(xi%3===0){
        ctx.font="10px -apple-system,sans-serif"; ctx.fillStyle="#555"; ctx.textAlign="center";
        ctx.fillText(mo, xx, H-PAD.bottom+16);
      }
    }

    // Линии для каждой активной метрики
    var metricsArr = getActiveArr();
    for(var mi=0;mi<metricsArr.length;mi++){
      var met=metricsArr[mi], color=METRIC_COLORS[met];
      var rgb=hexToRgb(color);

      var pts=[];
      for(var pi=0;pi<N;pi++){
        pts.push({x:toX(pi), y:toY(Number(DATA[pi][met]||0))});
      }

      // Area fill
      ctx.beginPath();
      ctx.moveTo(pts[0].x, toY(lo));
      ctx.lineTo(pts[0].x, pts[0].y);
      for(var ci=0;ci<pts.length-1;ci++){
        var p0=ci>0?pts[ci-1]:pts[ci], p1=pts[ci], p2=pts[ci+1], p3=ci<pts.length-2?pts[ci+2]:pts[ci+1];
        var cp1x=p1.x+(p2.x-p0.x)/4, cp1y=p1.y+(p2.y-p0.y)/4;
        var cp2x=p2.x-(p3.x-p1.x)/4, cp2y=p2.y-(p3.y-p1.y)/4;
        ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2.x,p2.y);
      }
      ctx.lineTo(pts[pts.length-1].x, toY(lo));
      ctx.closePath();
      ctx.fillStyle="rgba("+rgb+","+(metricsArr.length>1?0.04:0.08)+")";
      ctx.fill();

      // Плавная линия Безье
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for(var li=0;li<pts.length-1;li++){
        var lp0=li>0?pts[li-1]:pts[li], lp1=pts[li], lp2=pts[li+1], lp3=li<pts.length-2?pts[li+2]:pts[li+1];
        var lcp1x=lp1.x+(lp2.x-lp0.x)/4, lcp1y=lp1.y+(lp2.y-lp0.y)/4;
        var lcp2x=lp2.x-(lp3.x-lp1.x)/4, lcp2y=lp2.y-(lp3.y-lp1.y)/4;
        ctx.bezierCurveTo(lcp1x,lcp1y,lcp2x,lcp2y,lp2.x,lp2.y);
      }
      ctx.strokeStyle=color; ctx.lineWidth=2.5;
      ctx.lineJoin="round"; ctx.lineCap="round"; ctx.stroke();

      // Точки каждые 3 + первая/последняя
      for(var di=0;di<pts.length;di++){
        if(di%3!==0&&di!==0&&di!==pts.length-1) continue;
        ctx.beginPath(); ctx.arc(pts[di].x, pts[di].y, 3, 0, Math.PI*2);
        ctx.fillStyle=color; ctx.fill();
        ctx.strokeStyle="#1a1a1a"; ctx.lineWidth=1.5; ctx.stroke();
      }
    }

    // Легенда
    legend.innerHTML = metricsArr.map(function(met){
      return '<div style="display:flex;align-items:center;gap:5px;">'+
        '<span style="width:14px;height:3px;border-radius:2px;background:'+METRIC_COLORS[met]+';display:inline-block;"></span>'+
        '<span>'+MARKET_LABEL+' — '+METRIC_LABELS[met]+'</span></div>';
    }).join("");

    canvas._labels = labels;
    canvas._pts_map = {};
    metricsArr.forEach(function(met){
      canvas._pts_map[met] = DATA.map(function(d,i){ return {x:toX(i), y:toY(Number(d[met]||0))}; });
    });
    canvas._colW = colW;
    canvas._N = N;
    canvas._toY = toY;
  }

  function onMove(e) {
    if(!canvas._labels) return;
    var rect=canvas.getBoundingClientRect();
    var sx=scroll.scrollLeft;
    var mx=(e.clientX-rect.left)+sx;
    var idx=Math.round((mx-PAD.left-canvas._colW/2)/canvas._colW);
    if(idx<0||idx>=canvas._N){ tooltip.style.display="none"; return; }

    var lbl=canvas._labels[idx];
    var metricsArr=getActiveArr();
    var html='<div style="font-weight:700;color:'+PRIMARY+';margin-bottom:5px;font-size:13px;">'+lbl+'</div>';
    for(var i=0;i<metricsArr.length;i++){
      var met=metricsArr[i];
      var v=Number(DATA[idx][met]||0);
      html+='<div style="display:flex;align-items:center;gap:6px;">'+
        '<span style="width:8px;height:8px;border-radius:50%;background:'+METRIC_COLORS[met]+';flex-shrink:0;"></span>'+
        '<span style="color:#888;">'+METRIC_LABELS[met]+':</span> '+
        '<span style="font-weight:600;color:#e8e8e8;">'+fmtV(v,met)+'</span></div>';
    }
    tooltip.innerHTML=html;
    tooltip.style.display="block";

    // Умное позиционирование — тултип всегда в видимой области
    var ttW=tooltip.offsetWidth||180;
    var visW=scroll.clientWidth;
    var xOnScreen=PAD.left+idx*canvas._colW+canvas._colW/2-sx;

    var left=xOnScreen+14;
    if(left+ttW>visW-8) left=xOnScreen-ttW-14;
    if(left<4) left=4;

    var firstMet=metricsArr[0]||"revenue";
    var ptY=canvas._pts_map[firstMet]?canvas._pts_map[firstMet][idx].y:50;
    var ttH=tooltip.offsetHeight||80;
    var top=Math.max(4, ptY-ttH-10);
    if(top+ttH>H-PAD.bottom-10) top=Math.max(4, ptY+14);

    tooltip.style.left=left+"px";
    tooltip.style.top=top+"px";
  }

  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", function(){ tooltip.style.display="none"; });

  window[CID+"_toggle"] = function(met, btn) {
    var keys=Object.keys(activeMetrics).filter(function(k){ return activeMetrics[k]; });
    if(activeMetrics[met]){
      if(keys.length===1) return; // минимум 1 активная
      activeMetrics[met]=false;
      btn.classList.remove(CID+"_tab_on");
      btn.style.borderColor=""; btn.style.background=""; btn.style.color="";
    } else {
      activeMetrics[met]=true;
      btn.classList.add(CID+"_tab_on");
      btn.style.borderColor=METRIC_COLORS[met];
      btn.style.background=METRIC_COLORS[met]+"22";
      btn.style.color=METRIC_COLORS[met];
    }
    draw();
  };

  draw();
})();
</script>`;
}
// ─────────────────────────────────────────────────────────────────────────────

function generateNovaHtmlReport(
  markdown: string,
  nicheName: string,
  market: "wb" | "oz",
  trends: Record<string, unknown>[]
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const marketLabel = market === "wb" ? "Wildberries" : "Ozon";
  // WB — оранжевый заголовок, Ozon — синий
  const headerGradient = market === "wb"
    ? "linear-gradient(135deg, #993C1D, #c4522a)"
    : "linear-gradient(135deg, #0d3f6e, #185FA5)";
  const accentColor = market === "wb" ? "#ff6b3d" : "#4A9EE0";

  const chartHtml = buildInteractiveTrendChart(trends, market);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${marketLabel}: ${nicheName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e8e8e8; padding: 24px; max-width: 900px; margin: 0 auto; }
  .header { background: ${headerGradient}; border-radius: 16px; padding: 28px 32px; margin-bottom: 20px; }
  .header h1 { font-size: 26px; font-weight: 700; color: white; margin-bottom: 6px; }
  .header .meta { font-size: 13px; color: rgba(255,255,255,0.7); }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 22px; margin-bottom: 14px; }
  h2 { font-size: 17px; font-weight: 600; color: ${accentColor}; margin-bottom: 14px; border-bottom: 1px solid #2a2a2a; padding-bottom: 8px; }
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
  <h1>📊 ${nicheName} — ${marketLabel}</h1>
  <div class="meta">Анализ ниши MPStats · ${dateStr}</div>
</div>
${chartHtml}
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

async function sendNovaHtmlReport(
  botToken: string,
  chatId: number,
  html: string,
  nicheName: string,
  market: "wb" | "oz"
): Promise<void> {
  try {
    const marketSuffix = market === "wb" ? "wb" : "oz";
    const fileName = `nova-${nicheName.replace(/[^а-яёa-z0-9]/gi, "-").toLowerCase()}-${marketSuffix}-${Date.now()}.html`;
    const buffer = Buffer.from(html, "utf-8");
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    const marketLabel = market === "wb" ? "Wildberries" : "Ozon";
    formData.append("caption", `📊 ${nicheName} — ${marketLabel}`);
    formData.append("document", new Blob([buffer], { type: "text/html" }), fileName);
    await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: "POST", body: formData });
  } catch (e) {
    console.error("Nova HTML report send error:", e);
  }
}

// Запрос к Claude для генерации отчёта по одному маркету
async function generateNovaReport(
  agent: { systemPrompt: string },
  finalQuery: string,
  extraContext: string
): Promise<string> {
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4.6",
      max_tokens: 4000,
      messages: [
        { role: "system", content: agent.systemPrompt + extraContext },
        { role: "user", content: finalQuery },
      ],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "Не смог сформировать отчёт.";
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

    // ── CFO Finn ──────────────────────────────────────────────────────────────
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

    // ── Buyer Nova ────────────────────────────────────────────────────────────
    if (agentId === "buyer-nova" && finalQuery) {
      try {
        const queryToUse = await extractSearchKeyword(finalQuery);
        console.log("=== Nova TG: original:", finalQuery, "| keyword:", queryToUse);

        const market = detectMarket(finalQuery);

        // Структура данных для каждого маркета
        type MarketData = {
          nicheData: Awaited<ReturnType<typeof getWbNicheData>>;
          nicheName: string;
          market: "wb" | "oz";
        };
        const reports: MarketData[] = [];

        if (market === "wb" || market === "both") {
          const wbSubjects = await searchWbSubjects(queryToUse);
          if (wbSubjects.length > 0) {
            const nicheData = await getWbNicheData(Number(wbSubjects[0].id));
            reports.push({ nicheData, nicheName: String(wbSubjects[0].name) || queryToUse, market: "wb" });
          }
        }

        if (market === "oz" || market === "both") {
          const ozNiches = await searchOzNiches(queryToUse);
          if (ozNiches.length > 0) {
            const nicheData = await getOzNicheData(Number(ozNiches[0].id));
            reports.push({ nicheData, nicheName: String(ozNiches[0].name) || queryToUse, market: "oz" });
          }
        }

        console.log("=== Nova: found reports for:", reports.map(r => r.market).join(", "));

        if (reports.length === 0) {
          extraContext = `\n\n[MPStats не нашла нишу по запросу "${queryToUse}". Попроси написать конкретное название товара.]`;
          // Обычный текстовый ответ
          const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "claude-sonnet-4.6",
              max_tokens: 1000,
              messages: [
                { role: "system", content: agent.systemPrompt + extraContext },
                { role: "user", content: finalQuery },
              ],
            }),
          });
          const d = await res.json();
          await sendTelegramMessage(botToken, chatId, d.choices?.[0]?.message?.content ?? "Ниша не найдена.");
          return;
        }

        // Отправляем сообщение-анонс
        const marketNames = reports.map(r => r.market === "wb" ? "WB" : "Ozon").join(" и ");
        await sendTelegramMessage(botToken, chatId, `📊 Готовлю анализ ниши *${queryToUse}* (${marketNames}) — файл(ы) ниже 👇`);

        // Для каждого маркета — отдельный Claude-запрос и отдельный HTML
        for (const report of reports) {
          const ctx = "\n\n" + formatMpstatsForTelegram(
            { ...report.nicheData, market: report.market },
            report.nicheName
          );
          const markdown = await generateNovaReport(agent, finalQuery, ctx);
          const html = generateNovaHtmlReport(
            markdown,
            report.nicheName,
            report.market,
            report.nicheData.trends as Record<string, unknown>[]
          );
          await sendNovaHtmlReport(botToken, chatId, html, report.nicheName, report.market);
        }

        return; // Nova обработана — выходим

      } catch (e) {
        console.error("Nova MPStats TG error:", e);
        await sendTelegramMessage(botToken, chatId, "Произошла ошибка при получении данных MPStats.");
        return;
      }
    }

    // ── Scout Lin ─────────────────────────────────────────────────────────────
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

    // ── Все остальные агенты ──────────────────────────────────────────────────
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