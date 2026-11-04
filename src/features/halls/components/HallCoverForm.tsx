"use client";

import { ImagePlus } from "lucide-react";
import * as React from "react";
import { FormStatus } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/domain/PermissionGate";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { setHallCoverAction } from "../actions";
import { COVER_BUCKET, hallCoverUrl } from "../cover";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
// Same ratio as the banner on the player's hall card, at twice the displayed size for sharp screens.
const WIDTH = 1280;
const HEIGHT = 560;

type Status = { ok: boolean; message: string } | null;

/** Center-crops the picked image to the banner ratio and re-encodes it, so every cover is small and uniform. */
async function toBanner(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const scale = Math.max(WIDTH / bitmap.width, HEIGHT / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
  if (!blob) throw new Error("encode");
  return blob;
}

export function HallCoverForm({ hallId, coverPath }: { hallId: string; coverPath: string | null }) {
  const { t } = useI18n();
  const canEdit = useCan("hall.settings.manage");
  const [path, setPath] = React.useState(coverPath);
  const [pending, setPending] = React.useState(false);
  const [status, setStatus] = React.useState<Status>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const url = hallCoverUrl(path);

  async function removeObject(key: string | null) {
    if (key) await createClient().storage.from(COVER_BUCKET).remove([key]);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStatus(null);
    if (!TYPES.includes(file.type)) return setStatus({ ok: false, message: t.cfgCoverBadType });
    if (file.size > MAX_BYTES) return setStatus({ ok: false, message: t.cfgCoverTooBig });

    setPending(true);
    const next = `${hallId}/${crypto.randomUUID()}.webp`;
    try {
      const blob = await toBanner(file);
      const up = await createClient()
        .storage.from(COVER_BUCKET)
        .upload(next, blob, { contentType: "image/webp", cacheControl: "31536000" });
      if (up.error) throw up.error;
      const r = await setHallCoverAction(hallId, next);
      if (!r.ok) {
        await removeObject(next);
        setStatus({ ok: false, message: r.message });
        return;
      }
      await removeObject(path);
      setPath(next);
      setStatus({ ok: true, message: t.cfgCoverSaved });
    } catch {
      await removeObject(next).catch(() => {});
      setStatus({ ok: false, message: t.cfgCoverFailed });
    } finally {
      setPending(false);
    }
  }

  async function onRemove() {
    setStatus(null);
    setPending(true);
    const r = await setHallCoverAction(hallId, null);
    if (r.ok) {
      await removeObject(path).catch(() => {});
      setPath(null);
    }
    setStatus(r.ok ? { ok: true, message: t.cfgCoverRemoved } : { ok: false, message: r.message });
    setPending(false);
  }

  return (
    <div className="max-w-xl space-y-3">
      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/25 via-surface-raised to-accent/25">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="absolute inset-0 m-auto h-10 w-10 text-primary/40" aria-hidden />
        )}
      </div>
      <p className="text-sm text-muted">{t.cfgCoverHint}</p>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept={TYPES.join(",")}
            className="hidden"
            onChange={onPick}
            aria-label={t.cfgCover}
          />
          <Button type="button" pending={pending} onClick={() => input.current?.click()}>
            {path ? t.cfgCoverChange : t.cfgCoverUpload}
          </Button>
          {path && (
            <Button type="button" variant="secondary" disabled={pending} onClick={onRemove}>
              {t.cfgCoverRemove}
            </Button>
          )}
          <FormStatus state={status} />
        </div>
      )}
    </div>
  );
}
