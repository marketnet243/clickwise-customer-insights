// Pure analytics helpers shared by /dashboard and /analytique.
export type ClickRow = { link_id: string; created_at: string };
export type EventRow = {
  saas_id: string; link_id: string | null; event_type: string;
  external_user_id: string; step: string; created_at: string;
};
export type LinkMeta = { id: string; saas_id: string; channel: string; name: string };

const uniq = (rows: EventRow[], type: string) =>
  new Set(rows.filter((e) => e.event_type === type).map((e) => `${e.saas_id}:${e.external_user_id}`)).size;

/** Activation = user who completed at least one onboarding step. Subscription = subscription_activated. */
export function kpis(clicks: ClickRow[], events: EventRow[]) {
  const c = clicks.length;
  const signups = uniq(events, "signup");
  const activations = uniq(events, "onboarding_step");
  const subscriptions = uniq(events, "subscription_activated");
  return { clicks: c, signups, activations, subscriptions, conversion: c > 0 ? Math.round((subscriptions / c) * 1000) / 10 : 0 };
}

export function dailySeries(from: Date, to: Date, clicks: ClickRow[], events: EventRow[]) {
  const days: { date: string; clics: number; inscriptions: number; abonnements: number }[] = [];
  const idx = new Map<string, number>();
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  while (d <= end) { const k = dayKey(d); idx.set(k, days.length); days.push({ date: k, clics: 0, inscriptions: 0, abonnements: 0 }); d.setDate(d.getDate() + 1); }
  for (const c of clicks) { const i = idx.get(dayKey(new Date(c.created_at))); if (i !== undefined) days[i]!.clics++; }
  for (const e of events) {
    const i = idx.get(dayKey(new Date(e.created_at))); if (i === undefined) continue;
    if (e.event_type === "signup") days[i]!.inscriptions++;
    if (e.event_type === "subscription_activated") days[i]!.abonnements++;
  }
  return days;
}
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export function channelStats(links: LinkMeta[], clicks: ClickRow[], events: EventRow[]) {
  const ch = new Map(links.map((l) => [l.id, l.channel]));
  const out = new Map<string, { channel: string; clicks: number; signups: number; subscriptions: number }>();
  const get = (c: string) => { let r = out.get(c); if (!r) { r = { channel: c, clicks: 0, signups: 0, subscriptions: 0 }; out.set(c, r); } return r; };
  for (const c of clicks) get(ch.get(c.link_id) ?? "other").clicks++;
  for (const e of events) {
    if (!e.link_id) continue;
    const c = ch.get(e.link_id) ?? "other";
    if (e.event_type === "signup") get(c).signups++;
    if (e.event_type === "subscription_activated") get(c).subscriptions++;
  }
  return [...out.values()].sort((a, b) => b.clicks - a.clicks || b.signups - a.signups);
}

export function funnel(saasId: string, links: LinkMeta[], clicks: ClickRow[], events: EventRow[]) {
  const linkIds = new Set(links.filter((l) => l.saas_id === saasId).map((l) => l.id));
  const ev = events.filter((e) => e.saas_id === saasId);
  const users = (pred: (e: EventRow) => boolean) => new Set(ev.filter(pred).map((e) => e.external_user_id)).size;
  const stepCounts = new Map<string, number>();
  for (const e of ev) if (e.event_type === "onboarding_step" && e.step) stepCounts.set(e.step, (stepCounts.get(e.step) ?? 0) + 1);
  const steps = [...stepCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  return [
    { label: "Clics", value: clicks.filter((c) => linkIds.has(c.link_id)).length },
    { label: "Inscriptions", value: users((e) => e.event_type === "signup") },
    ...steps.map((s) => ({ label: s, value: users((e) => e.event_type === "onboarding_step" && e.step === s) })),
    { label: "Abonnement payant", value: users((e) => e.event_type === "subscription_activated") },
  ];
}

/** Most frequent last-reached step among signed-up users who never subscribed. */
export function blockingStep(saasId: string, events: EventRow[]) {
  const byUser = new Map<string, EventRow[]>();
  for (const e of events) if (e.saas_id === saasId) { const a = byUser.get(e.external_user_id) ?? []; a.push(e); byUser.set(e.external_user_id, a); }
  const counts = new Map<string, number>();
  for (const evs of byUser.values()) {
    if (!evs.some((e) => e.event_type === "signup")) continue;
    if (evs.some((e) => e.event_type === "subscription_activated")) continue;
    const steps = evs.filter((e) => e.event_type === "onboarding_step").sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = steps.length ? steps[steps.length - 1]!.step : "Inscription";
    counts.set(last, (counts.get(last) ?? 0) + 1);
  }
  let best: { step: string; users: number } | null = null;
  for (const [step, n] of counts) if (!best || n > best.users) best = { step, users: n };
  return best;
}

/** Flow source channel → SaaS → furthest stage reached, per attributed user. */
export function sankey(links: LinkMeta[], saasNames: Map<string, string>, events: EventRow[], channelLabel: (c: string) => string) {
  const linkCh = new Map(links.map((l) => [l.id, l.channel]));
  const users = new Map<string, { ch: string; saas: string; stage: number }>();
  for (const e of events) {
    const k = `${e.saas_id}:${e.external_user_id}`;
    let u = users.get(k);
    if (!u) { u = { ch: "", saas: e.saas_id, stage: 0 }; users.set(k, u); }
    if (e.link_id && !u.ch) u.ch = linkCh.get(e.link_id) ?? "other";
    const st = e.event_type === "subscription_activated" ? 3 : e.event_type === "onboarding_step" ? 2 : e.event_type === "signup" ? 1 : 0;
    u.stage = Math.max(u.stage, st);
  }
  const stageNames = ["", "Inscription", "Onboarding", "Abonné"];
  const nodes: { name: string }[] = []; const ni = new Map<string, number>();
  const node = (key: string, name: string) => { let i = ni.get(key); if (i === undefined) { i = nodes.length; ni.set(key, i); nodes.push({ name }); } return i; };
  const lk = new Map<string, number>();
  const add = (s: number, t: number) => lk.set(`${s}>${t}`, (lk.get(`${s}>${t}`) ?? 0) + 1);
  for (const u of users.values()) {
    if (!u.ch || u.stage === 0) continue;
    const a = node(`c:${u.ch}`, channelLabel(u.ch));
    const b = node(`s:${u.saas}`, saasNames.get(u.saas) ?? "SaaS");
    const c = node(`t:${u.stage}`, stageNames[u.stage]!);
    add(a, b); add(b, c);
  }
  const linksOut = [...lk.entries()].map(([k, value]) => { const [s, t] = k.split(">").map(Number); return { source: s!, target: t!, value }; });
  return { nodes, links: linksOut };
}
