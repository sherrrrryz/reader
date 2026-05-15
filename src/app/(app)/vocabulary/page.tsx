import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VocabularyList } from "@/components/VocabularyList";
import type { VocabularyEntry } from "@/components/WordCard";

export const dynamic = "force-dynamic";

export default async function VocabularyPage({
  searchParams,
}: {
  searchParams: Promise<{ word?: string }>;
}) {
  const { word } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vocabulary")
    .select("*")
    .order("created_at", { ascending: false });
  const items = (data ?? []) as VocabularyEntry[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My Vocabulary</h1>
      <VocabularyList initial={items} focusWord={word ?? null} />
    </div>
  );
}
