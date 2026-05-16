"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Please sign in before uploading",
  no_file: "No file selected",
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
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(messageFor(json?.error));
        return;
      }
      if (json?.extraction === "error") {
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
