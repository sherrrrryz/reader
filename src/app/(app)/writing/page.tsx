import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WritingList, type WritingRow } from "@/components/WritingList";

export const dynamic = "force-dynamic";

export default async function WritingPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("writings")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false });

  const writings = (data ?? []) as WritingRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Writing</h1>
      </div>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <WritingList writings={writings} />
    </div>
  );
}
