import { NextRequest, NextResponse } from "next/server";
import {
  searchWbSubjects,
  searchOzNiches,
  getWbNicheData,
  getOzNicheData,
  detectMarket,
} from "@/lib/mpstats";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, subjectId, subjectMarket } = body;

    if (!process.env.MPSTATS_TOKEN) {
      return NextResponse.json({ error: "token_missing" }, { status: 500 });
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const d2 = yesterday.toISOString().split("T")[0];
    const d1 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    if (subjectId && subjectMarket) {
      const data = subjectMarket === "wb"
        ? await getWbNicheData(Number(subjectId))
        : await getOzNicheData(Number(subjectId));
      return NextResponse.json({ type: "analysis", market: subjectMarket, data, period: { d1, d2 } });
    }

    const market = detectMarket(query ?? "");
    let subjects: { id: unknown; name: unknown; market: string }[] = [];

    if (market === "wb") {
      subjects = await searchWbSubjects(query);
    } else if (market === "oz") {
      subjects = await searchOzNiches(query);
    } else {
      const [wb, oz] = await Promise.all([searchWbSubjects(query), searchOzNiches(query)]);
      subjects = [...wb.slice(0, 4), ...oz.slice(0, 4)];
    }

    if (!subjects.length) {
      return NextResponse.json({ type: "not_found", query });
    }

    return NextResponse.json({ type: "search", subjects, market, query });

  } catch (error) {
    console.error("MPStats route error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}