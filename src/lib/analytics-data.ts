import { supabase } from "@/integrations/supabase/client";
import type { ClickRow, EventRow, LinkMeta } from "./analytics";

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = []; const size = 1000;
  for (let p = 0; p < 50; p++) {
    const { data, error } = await build(p * size, p * size + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function loadAnalytics(from: Date, to: Date) {
  const f = from.toISOString(); const end = new Date(to); end.setHours(23, 59, 59, 999); const t = end.toISOString();
  const [links, saas, clicks, events] = await Promise.all([
    all<LinkMeta>((a, b) => supabase.from("tracking_links").select("id, saas_id, channel, name").range(a, b)),
    all<{ id: string; name: string }>((a, b) => supabase.from("saas").select("id, name").order("name").range(a, b)),
    all<ClickRow>((a, b) => supabase.from("clicks").select("link_id, created_at").gte("created_at", f).lte("created_at", t).range(a, b)),
    all<EventRow>((a, b) => supabase.from("events").select("saas_id, link_id, event_type, external_user_id, step, created_at").gte("created_at", f).lte("created_at", t).order("created_at").range(a, b)),
  ]);
  return { links, saas, clicks, events };
}
