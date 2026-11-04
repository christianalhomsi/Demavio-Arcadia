export const COVER_BUCKET = "hall-covers";

/** Public URL of a hall's cover image, or null when the hall has none. */
export function hallCoverUrl(coverPath: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!coverPath || !base) return null;
  return `${base}/storage/v1/object/public/${COVER_BUCKET}/${coverPath}`;
}
