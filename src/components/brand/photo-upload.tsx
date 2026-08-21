// src/components/brand/photo-upload.tsx
"use client";
import { useRef, useState } from "react";
import { Upload, CheckCircle } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor, type DescriptorResult } from "@/lib/face/descriptor";
import { passesQualityGate, passesProfilePhotoQualityGate } from "@/lib/face/quality";
import { normalizeImageOrientation } from "@/lib/face/image-orient";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB — generous for a phone-camera JPEG/PNG

/**
 * File-upload counterpart to FaceCapture — same descriptor-extraction +
 * quality-gate pipeline, sourced from a static uploaded image instead of a
 * live webcam frame. Used for the matric-card and profile-photo upload
 * steps, where "hold it up to the camera" isn't the desired UX.
 */
export function PhotoUpload({
  guide,
  accept = "image/*",
  strictFraming = false,
  onCapture,
}: {
  guide: string;
  accept?: string;
  /** Applies the 50-70% face-height framing bound (profile-photo step only) instead of the base gate. */
  strictFraming?: boolean;
  /** `result` is null if a face couldn't be confidently extracted — jpegBase64 is still returned so the caller can show/retry. */
  onCapture: (result: DescriptorResult | null, jpegBase64: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setError("File too large — please upload a photo under 8MB.");
      return;
    }
    setStatus("checking");
    setError(null);
    try {
      // Corrects for EXIF orientation before anything else touches the
      // image — otherwise a portrait phone photo can display upright (the
      // browser honors EXIF for <img>) while the canvas-based detector below
      // sees the raw, unrotated pixels and fails to find a face at all.
      const dataUrl = await normalizeImageOrientation(file);
      setPreviewUrl(dataUrl);

      // Detection runs against a standalone Image, NOT a ref to the preview
      // <img> above — setPreviewUrl doesn't synchronously mount/update the
      // DOM (React commits are async), so on the very first upload the
      // preview element wouldn't exist yet at this point even though it
      // renders moments later. A standalone Image decouples detection from
      // React's render timing entirely.
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Couldn't load that image — try a different file."));
        img.src = dataUrl;
      });

      const human = await loadHuman();
      if (!human) {
        setStatus("error");
        setError("Face detector failed to load — please refresh and try again.");
        onCapture(null, dataUrl.split(",")[1]);
        return;
      }
      const result = await extractDescriptor(human, img);
      const gate = strictFraming
        ? passesProfilePhotoQualityGate(result)
        : passesQualityGate(result);
      const jpegBase64 = dataUrl.split(",")[1];
      if (!gate.ok || !result) {
        setStatus("error");
        setError(gate.reason ?? "Couldn't find a clear face in that photo.");
        onCapture(null, jpegBase64);
        return;
      }
      setStatus("ready");
      onCapture(result, jpegBase64);
    } catch (err: any) {
      setStatus("error");
      setError(err?.message ?? "Something went wrong reading that photo.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="min-h-48 max-h-96 rounded-2xl border-2 border-ink bg-secondary overflow-hidden relative flex items-center justify-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            className="max-w-full max-h-96 object-contain"
            alt="Uploaded preview"
          />
        ) : (
          <Upload className="w-12 h-12 text-muted-foreground" />
        )}
        <p className="absolute bottom-2 left-2 px-2 py-1 rounded-full text-[11px] font-mono border-2 border-ink bg-card">
          {guide}
        </p>
        {status === "ready" && (
          <CheckCircle className="absolute top-2 right-2 w-6 h-6 text-lime bg-ink rounded-full p-0.5" />
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <WakeoutButton
        variant="sky"
        size="sm"
        className="w-full"
        disabled={status === "checking"}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-4 h-4" />
        {status === "checking"
          ? "Checking…"
          : previewUrl
            ? "Choose a different photo"
            : "Upload photo"}
      </WakeoutButton>
      {error && <p className="text-sm text-pink">{error}</p>}
    </div>
  );
}
