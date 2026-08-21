"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Upload, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman } from "@/lib/face-id/embedding";
import { checkPassportPhoto } from "@/lib/face-id/quality";

const MAX_BYTES = 2 * 1024 * 1024;
const MIN_DIMENSION = 480;

interface Props {
  onValidated: (photoBase64: string, embedding: number[]) => void;
}

export function PassportUpload({ onValidated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Please upload a JPEG or PNG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Photo must be under 2MB.");
      return;
    }

    setChecking(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      });

      if (image.naturalWidth < MIN_DIMENSION || image.naturalHeight < MIN_DIMENSION) {
        setError(`Photo must be at least ${MIN_DIMENSION}x${MIN_DIMENSION}px.`);
        return;
      }

      const human = await loadHuman();
      const quality = await checkPassportPhoto(human, image);
      if (!quality.ok) {
        setError(quality.reason);
        return;
      }

      const result = await human.detect(image);
      const embedding = Array.from((result.face?.[0]?.embedding ?? []) as number[]);
      onValidated(dataUrl, embedding);
    } catch {
      setError("Could not process this photo. Please try another.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <WakeoutButton
        variant="sky"
        size="default"
        disabled={checking}
        onClick={() => inputRef.current?.click()}
        className="w-full"
      >
        {checking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Checking photo…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" /> Upload passport-style photo
          </>
        )}
      </WakeoutButton>
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-pink/10 border-2 border-pink text-sm text-pink">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}
