// Server-only Telegram helpers. Bot token and chat id live encrypted in integrations.config_encrypted.
import { decrypt, encrypt } from "./crypto";
import { alertTypeFor, formatAlert, isAlertEnabled } from "@/lib/alerts";

export type TelegramConfig = {
  token: string;
  webhook_secret: string;
  bot_username?: string | undefined;
  chat_id?: number | undefined;
  chat_title?: string | undefined;
  link_code?: string | undefined;
  link_expires?: number | undefined;
};

type Db = any; // supabase client (admin or user)

export async function tgApi(token: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: any; description?: string };
  if (!json.ok) throw new Error(json.description ?? `Telegram ${method} failed`);
  return json.result;
}

export async function loadTelegram(db: Db): Promise<{ id: string; status: string; config: TelegramConfig } | null> {
  const { data } = await db.from("integrations").select("id, status, config_encrypted").eq("type", "telegram").maybeSingle();
  if (!data?.config_encrypted) return null;
  try {
    return { id: data.id, status: data.status, config: JSON.parse(await decrypt(data.config_encrypted)) };
  } catch {
    return null;
  }
}

export async function saveTelegram(db: Db, config: TelegramConfig, status: string) {
  const { data, error } = await db
    .from("integrations")
    .upsert({ type: "telegram", status, config_encrypted: await encrypt(JSON.stringify(config)) }, { onConflict: "type" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Called after a new event is stored. Never throws: alerts must not break ingestion. */
export async function notifyEvent(
  db: Db,
  ev: { saas_id: string; event_type: string; external_user_id: string; step: string; link_id: string | null; metadata: Record<string, unknown> },
) {
  try {
    const tg = await loadTelegram(db);
    if (!tg || tg.status !== "active" || !tg.config.chat_id) return;
    let first = false;
    if (ev.event_type === "onboarding_step") {
      const { count } = await db.from("events").select("id", { count: "exact", head: true })
        .eq("saas_id", ev.saas_id).eq("external_user_id", ev.external_user_id).eq("event_type", "onboarding_step");
      first = count === 1;
    }
    const type = alertTypeFor(ev.event_type, { firstOnboardingStep: first, metadata: ev.metadata });
    if (!type) return;
    const { data: rules } = await db.from("alert_rules").select("saas_id, event_type, enabled").eq("integration_id", tg.id);
    if (!isAlertEnabled(rules ?? [], ev.saas_id, type)) return;
    const { data: saas } = await db.from("saas").select("name").eq("id", ev.saas_id).maybeSingle();
    let channel: string | null = null;
    if (ev.link_id) {
      const { data: link } = await db.from("tracking_links").select("channel").eq("id", ev.link_id).maybeSingle();
      const { channelLabel } = await import("@/lib/channels");
      channel = link ? channelLabel(link.channel) : null;
    }
    await tgApi(tg.config.token, "sendMessage", {
      chat_id: tg.config.chat_id,
      text: formatAlert({ saas: saas?.name ?? "SaaS", type, channel, step: ev.step || null, at: new Date() }),
    });
  } catch (e) {
    console.error("telegram notify failed", e instanceof Error ? e.message : e);
  }
}
