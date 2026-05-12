import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assignee = searchParams.get("assignee");
  const status = searchParams.get("status");

  let query = supabase.from("tasks").select("*").order("deadline", { ascending: true });

  if (assignee) query = query.ilike("assignee", `%${assignee}%`);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tasks: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, assignee, assignee_username, controller, controller_username, deadline, chat_id } = body;

  const { data, error } = await supabase.from("tasks").insert({
    title,
    assignee,
    assignee_username,
    controller,
    controller_username,
    deadline,
    chat_id,
    status: "новая",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status, deadline } = body;

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (deadline) updates.deadline = deadline;

  const { data, error } = await supabase.from("tasks").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ task: data });
}