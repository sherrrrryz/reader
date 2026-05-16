import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WritingDetail, type WritingDetailData } from "@/components/WritingDetail";

export const dynamic = "force-dynamic";

export default async function WritingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: writing } = await supabase
    .from("writings")
    .select("id, title, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!writing) notFound();

  const { data: versions } = await supabase
    .from("writing_versions")
    .select("id, writing_id, content, version_number, created_at")
    .eq("writing_id", id)
    .order("version_number", { ascending: false });

  const versionIds = (versions ?? []).map((v) => v.id);
  const { data: comments } = versionIds.length
    ? await supabase
        .from("writing_comments")
        .select("id, version_id, range_start, range_end, selected_text, body, created_at, updated_at")
        .in("version_id", versionIds)
        .order("created_at", { ascending: true })
    : { data: [] as never[] };

  const data: WritingDetailData = {
    writing,
    versions: versions ?? [],
    comments: comments ?? [],
  };

  return <WritingDetail data={data} />;
}
