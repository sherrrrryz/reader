"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Please sign in before uploading",
  bad_request: "Invalid upload request",
  forbidden: "Not allowed",
  not_pdf: "Only PDF files are supported",
  empty_file: "File is empty",
  too_large: "File is too large (50MB max)",
  storage_failed: "Upload to storage failed, please retry",
  db_failed: "Failed to save document record, please retry",
};

function messageFor(code: string | undefined) {
  if (!code) return "Upload failed";
  return ERROR_MESSAGES[code] ?? "Upload failed";
}

export function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Step 1: ask the server for an upload slot (id + storagePath).
      const initRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, size: file.size }),
      });
      const initJson = await initRes.json().catch(() => ({}));
      if (!initRes.ok) {
        toast.error(messageFor(initJson?.error));
        return;
      }
      const { id, storagePath } = initJson as { id: string; storagePath: string };

      // Step 2: upload the file directly to Supabase Storage from the browser.
      // This bypasses Vercel's 4.5MB serverless body limit.
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from("pdfs")
        .upload(storagePath, file, { contentType: "application/pdf", upsert: false });
      if (upErr) {
        console.error("direct storage upload failed", upErr);
        toast.error(messageFor("storage_failed"));
        return;
      }

      // Step 3: create the DB row and run extraction.
      const finRes = await fetch("/api/documents/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, filename: file.name, storagePath }),
      });
      const finJson = await finRes.json().catch(() => ({}));
      if (!finRes.ok) {
        // Finalize failed — server already cleaned up the orphan storage object
        // on db_failed; for other errors, try to remove it from the client too
        // so the user can retry without an orphan file.
        await supabase.storage.from("pdfs").remove([storagePath]).catch(() => {});
        toast.error(messageFor(finJson?.error));
        return;
      }

      if (finJson?.extraction === "error") {
        toast.error("Upload complete, but parsing failed");
      } else {
        toast.success("Upload complete");
      }
      router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      toast.error("Network error, please retry");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onChange} />
      <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
        <Upload className="size-4" />
        {uploading ? "Uploading…" : "Upload PDF"}
      </Button>
    </>
  );
}
