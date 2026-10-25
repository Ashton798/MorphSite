"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { readProductImage } from "@/lib/image-upload";

export function ImageUpload({ onUpload, onError, onBusy, disabled = false }: {
  onUpload: (image: string) => void;
  onError: (error: string) => void;
  onBusy?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传产品图片" disabled={disabled || busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true); onBusy?.(true); onError("");
          try { onUpload(await readProductImage(file)); }
          catch (error) { onError(error instanceof Error ? error.message : "上传失败，请重试。"); }
          finally { setBusy(false); onBusy?.(false); }
        }} />
      <button className="upload-button" type="button" onClick={() => input.current?.click()} disabled={disabled || busy}>
        {busy ? <LoaderCircle size={16} className="spin" /> : <ImagePlus size={16} />}
        {busy ? "正在处理" : "上传图片"}
      </button>
    </>
  );
}
