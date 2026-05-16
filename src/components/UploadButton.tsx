"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "请先登录后再上传",
  no_file: "未选择文件",
  not_pdf: "仅支持 PDF 文件",
  empty_file: "文件为空",
  too_large: "文件过大（上限 50MB）",
  storage_failed: "上传到存储失败，请重试",
  db_failed: "保存文档记录失败，请重试",
};

function messageFor(code: string | undefined) {
  if (!code) return "上传失败";
  return ERROR_MESSAGES[code] ?? "上传失败";
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
        toast.error("上传完成，但解析失败");
      } else {
        toast.success("上传完成");
      }
      router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      toast.error("网络错误，请重试");
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
