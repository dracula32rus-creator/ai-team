import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const MONTH_NAMES: Record<number, string> = {
  1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
  5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
  9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь",
};

function getMonthSheet(dateStr: string): string {
  // Парсим дату в форматах: 14.04.2026, 14.04, 14.09
  const parts = dateStr.split(".");
  if (parts.length >= 2) {
    const month = parseInt(parts[1]);
    if (month >= 1 && month <= 12) {
      return MONTH_NAMES[month];
    }
  }
  // Если не распарсили — берём текущий месяц
  const now = new Date();
  return MONTH_NAMES[now.getMonth() + 1];
}

export async function POST(req: NextRequest) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      return NextResponse.json({ error: "GOOGLE_SHEETS_ID not configured" }, { status: 500 });
    }

    const { date, amount, category, description } = await req.json();

    const sheetName = getMonthSheet(date);
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[date, amount, category, description]],
      },
    });

    return NextResponse.json({ success: true, sheet: sheetName });
  } catch (error) {
    console.error("Sheets error:", error);
    return NextResponse.json({ error: "Failed to write to sheets" }, { status: 500 });
  }
}