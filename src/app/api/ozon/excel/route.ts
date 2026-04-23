import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

interface OzonTransaction {
  operation_type: string;
  operation_type_name: string;
  amount: number;
  delivery_charge: number;
  return_delivery_charge: number;
  sale_commission: number;
  accruals_for_sale: number;
  operation_date: string;
  posting?: { posting_number?: string };
  items?: Array<{ name: string; sku: number }>;
}

export async function POST(req: NextRequest) {
  try {
    const { dateFrom, dateTo } = await req.json();

    const now = new Date();
    const defaultTo = dateTo ?? now.toISOString().split("T")[0];
    const defaultFrom = dateFrom ?? new Date(now.setDate(now.getDate() - 30)).toISOString().split("T")[0];

    // Тянем транзакции
    const res = await fetch("https://api-seller.ozon.ru/v3/finance/transaction/list", {
      method: "POST",
      headers: {
        "Client-Id": String(process.env.OZON_CLIENT_ID),
        "Api-Key": process.env.OZON_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          date: {
            from: `${defaultFrom}T00:00:00.000Z`,
            to: `${defaultTo}T23:59:59.000Z`,
          },
          operation_type: [],
          posting_number: "",
          transaction_type: "all",
        },
        page: 1,
        page_size: 1000,
      }),
    });

    const data = await res.json();
    const operations: OzonTransaction[] = data.result?.operations ?? [];

    // Считаем сводку
    let totalRevenue = 0;
    let totalCommissions = 0;
    let totalLogistics = 0;
    let totalReturns = 0;
    let ordersCount = 0;
    let returnsCount = 0;

    for (const op of operations) {
      const amount = op.amount ?? 0;
      const deliveryCharge = op.delivery_charge ?? 0;
      const returnDelivery = op.return_delivery_charge ?? 0;
      const commission = op.sale_commission ?? 0;

      if (op.operation_type?.includes("OperationAgentDeliveredToCustomer")) ordersCount++;
      if (op.operation_type?.includes("ClientReturn")) {
        returnsCount++;
        totalReturns += Math.abs(amount);
      }

      if (amount > 0) totalRevenue += amount;
      if (commission < 0) totalCommissions += Math.abs(commission);
      totalLogistics += Math.abs(deliveryCharge) + Math.abs(returnDelivery);
    }

    const netProfit = totalRevenue - totalCommissions - totalLogistics - totalReturns;

    // Создаём Excel файл
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Финн CFO";
    workbook.created = new Date();

    // Лист 1 — Сводка
    const summary = workbook.addWorksheet("Сводка");
    summary.columns = [
      { header: "Показатель", key: "name", width: 40 },
      { header: "Значение", key: "value", width: 20 },
    ];
    summary.getRow(1).font = { bold: true, size: 12 };
    summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF185FA5" } };
    summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    summary.addRows([
      { name: "Период", value: `${defaultFrom} — ${defaultTo}` },
      { name: "Выручка", value: totalRevenue },
      { name: "Комиссии маркетплейса", value: -totalCommissions },
      { name: "Логистика", value: -totalLogistics },
      { name: "Возвраты", value: -totalReturns },
      { name: "Чистая прибыль до расходов", value: netProfit },
      { name: "", value: "" },
      { name: "Заказов доставлено", value: ordersCount },
      { name: "Возвратов", value: returnsCount },
      { name: "% возвратов", value: ordersCount ? `${((returnsCount / ordersCount) * 100).toFixed(1)}%` : "—" },
      { name: "Средний чек", value: ordersCount ? Math.round(totalRevenue / ordersCount) : 0 },
      { name: "Всего операций в отчёте", value: operations.length },
    ]);

    // Форматирование денег
    summary.getColumn("value").numFmt = "#,##0 ₽";
    summary.getCell("B7").font = { bold: true, size: 14 };
    if (netProfit > 0) {
      summary.getCell("B7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1F4DD" } };
    } else {
      summary.getCell("B7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCDD2" } };
    }

    // Лист 2 — Детализация операций
    const details = workbook.addWorksheet("Операции");
    details.columns = [
      { header: "Дата", key: "date", width: 20 },
      { header: "Тип", key: "type", width: 40 },
      { header: "Номер отправления", key: "posting", width: 25 },
      { header: "Сумма", key: "amount", width: 15 },
      { header: "Комиссия", key: "commission", width: 15 },
      { header: "Логистика", key: "delivery", width: 15 },
      { header: "Обр. логистика", key: "return_delivery", width: 15 },
    ];
    details.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    details.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF185FA5" } };

    for (const op of operations) {
      details.addRow({
        date: op.operation_date,
        type: op.operation_type_name ?? op.operation_type,
        posting: op.posting?.posting_number ?? "",
        amount: op.amount ?? 0,
        commission: op.sale_commission ?? 0,
        delivery: op.delivery_charge ?? 0,
        return_delivery: op.return_delivery_charge ?? 0,
      });
    }

    details.getColumn("amount").numFmt = "#,##0.00 ₽";
    details.getColumn("commission").numFmt = "#,##0.00 ₽";
    details.getColumn("delivery").numFmt = "#,##0.00 ₽";
    details.getColumn("return_delivery").numFmt = "#,##0.00 ₽";

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ozon-report-${defaultFrom}-${defaultTo}.xlsx"`,
      },
    });

  } catch (error) {
    console.error("Ozon Excel error:", error);
    return NextResponse.json({ error: "Excel failed" }, { status: 500 });
  }
}