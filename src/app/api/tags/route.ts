import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_NAME = 32;

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME) return null;
  return trimmed;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("tags")
    .select("id, name, created_at")
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tags: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = normalizeName(body.name);
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  // Idempotent create: if the tag exists (citext unique), return it.
  const { data: existing } = await supabase
    .from("tags")
    .select("id, name, created_at")
    .eq("name", name)
    .maybeSingle();
  if (existing) return NextResponse.json({ tag: existing });

  const { data, error } = await supabase
    .from("tags")
    .insert({ user_id: auth.user.id, name })
    .select("id, name, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  return NextResponse.json({ tag: data });
}
