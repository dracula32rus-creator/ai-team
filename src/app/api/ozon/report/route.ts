import { NextRequest, NextResponse } from "next/server";

interface OzonTransaction {
  operation_type: string;
  operation_type_name: string;
  amount: number;
  delivery_charge: number;
  return_delivery_charge: number;
  sale_commission: number;
  accruals_for_sale: number;
  operation_date: string;
  items?: Array<{ name: string; sku: number }>;
}

export async function POST(req: NextRequest) {
  try {
    const { dateFrom, dateTo } = await req.json();

    // Формируем даты по умолчанию — последние 30 дней
    const now = new Date();
    const defaultTo = dateTo ?? now.toISOString().split("T")[0];
    const defaultFrom = dateFrom ?? new Date(now.setDate(now.getDate() - 30)).toISOString().split("T")[0];

    // Получаем отчёт по транзакциям
    const res = await fetch("https://api-seller.ozon.ru/v3/finance/transaction/list", {
      method: "POST",
      headers: {
        "Client-Id": process.env.OZON_CLIENT_ID!,
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

    if (!res.ok) {
      const error = await res.text();
      console.error("Ozon API error:", error);
      return NextResponse.json({ error: "Ozon API failed", details: error }, { status: 500 });
    }

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

      if (op.operation_type?.includes("OperationAgentDeliveredToCustomer") || op.operation_type_name?.toLowerCase().includes("доставк")) {
        ordersCount++;
      }

      if (op.operation_type?.includes("ClientReturn") || op.operation_type_name?.toLowerCase().includes("возврат")) {
        returnsCount++;
        totalReturns += Math.abs(amount);
      }

      if (amount > 0) totalRevenue += amount;
      if (commission < 0) totalCommissions += Math.abs(commission);
      totalLogistics += Math.abs(deliveryCharge) + Math.abs(returnDelivery);
    }

    const netProfit = totalRevenue - totalCommissions - totalLogistics - totalReturns;

    return NextResponse.json({
      period: { from: defaultFrom, to: defaultTo },
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalCommissions: Math.round(totalCommissions),
        totalLogistics: Math.round(totalLogistics),
        totalReturns: Math.round(totalReturns),
        netProfit: Math.round(netProfit),
        ordersCount,
        returnsCount,
      },
      operationsCount: operations.length,
    });

  } catch (error) {
    console.error("Ozon report error:", error);
    return NextResponse.json({ error: "Report failed" }, { status: 500 });
  }
}