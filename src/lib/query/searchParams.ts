export interface ListParams {
  page: number;
  pageSize: number;
  sort?: string;
  dir: "asc" | "desc";
  q?: string;
  filters: Record<string, string>;
}

const MAX_PAGE_SIZE = 100;
const RESERVED = new Set(["page", "pageSize", "sort", "dir", "q"]);

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function toInt(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parses URL search params into a validated list query. Untrusted input: clamps and ignores junk. */
export function parseListParams(raw: RawParams, defaults: { pageSize?: number } = {}): ListParams {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = first(value);
    if (!RESERVED.has(key) && v) filters[key] = v;
  }
  return {
    page: toInt(first(raw.page), 1),
    pageSize: Math.min(toInt(first(raw.pageSize), defaults.pageSize ?? 25), MAX_PAGE_SIZE),
    sort: first(raw.sort),
    dir: first(raw.dir) === "desc" ? "desc" : "asc",
    q: first(raw.q)?.slice(0, 200) || undefined,
    filters,
  };
}

/** Converts page/pageSize to a Supabase `.range(from, to)` pair. */
export function toRange({
  page,
  pageSize,
}: Pick<ListParams, "page" | "pageSize">): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/** Builds a query string, replacing the given keys and dropping empty values. */
export function withParams(current: URLSearchParams, patch: Record<string, string | undefined>) {
  const next = new URLSearchParams(current);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") next.delete(k);
    else next.set(k, v);
  }
  return next.toString();
}
