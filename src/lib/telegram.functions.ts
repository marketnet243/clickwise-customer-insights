import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function audit(ctx: { supabase: any; userId: string }, action: string, details: Record<string, unknown> = {}) {
  await ctx.supabase.from("audit_logs").insert({ user_id: ctx.userId, action, details });
}

export const getTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTelegram } = await import("@/lib/server/telegram.server");
    const tg = await loadTelegram(context.supabase);
    if (!tg) return { configured: false as const };
    const c = tg.config;
    const pending = c.link_code && c.link_expires && c.link_expires > Date.now() ? { code: c.link_code, expires: c.link_expires } : null;
    return {
      configured: true as const,
      id: tg.id,
      status: tg.status,
      botUsername: c.bot_username ?? null,
      chatTitle: c.chat_id ? (c.chat_title ?? "Chat lié") : null,
      pending,
    };
  });

export const saveTelegramToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().regex(/^\d{5,}:[A-Za-z0-9_-]{30,}$/, "Token invalide") }).parse(d))
  .handler(async ({ data, context }) => {
    const { tgApi, saveTelegram } = await import("@/lib/server/telegram.server");
    const { randomToken } = await import("@/lib/server/crypto");
    let me: { username?: string };
    try { me = await tgApi(data.token, "getMe", {}); } catch { throw new Error("Token refusé par Telegram"); }
    const webhook_secret = randomToken(24).replace(/[^A-Za-z0-9_-]/g, "");
    const origin = new URL(getRequest().url).origin;
    try {
      await tgApi(data.token, "setWebhook", { url: `${origin}/api/public/telegram-webhook`, secret_token: webhook_secret, allowed_updates: ["message"] });
    } catch (e) {
      throw new Error(`Webhook Telegram refusé : ${e instanceof Error ? e.message : ""}`);
    }
    await saveTelegram(context.supabase, { token: data.token, webhook_secret, bot_username: me.username }, "pending");
    await audit(context, "telegram.token_saved", { bot: me.username });
    return { botUsername: me.username ?? null };
  });

export const createTelegramLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTelegram, saveTelegram } = await import("@/lib/server/telegram.server");
    const { generateCode } = await import("@/lib/channels");
    const tg = await loadTelegram(context.supabase);
    if (!tg) throw new Error("Bot non configuré");
    const code = `VN-${generateCode(6).toUpperCase()}`;
    const expires = Date.now() + 10 * 60 * 1000;
    await saveTelegram(context.supabase, { ...tg.config, link_code: code, link_expires: expires }, tg.status);
    await audit(context, "telegram.link_code");
    return { code, expires };
  });

export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTelegram, tgApi } = await import("@/lib/server/telegram.server");
    const tg = await loadTelegram(context.supabase);
    if (!tg?.config.chat_id) throw new Error("Aucun chat lié");
    await tgApi(tg.config.token, "sendMessage", { chat_id: tg.config.chat_id, text: "✅ VisionNet : test réussi." });
    await audit(context, "telegram.test");
    return { ok: true };
  });

export const disconnectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTelegram, tgApi } = await import("@/lib/server/telegram.server");
    const tg = await loadTelegram(context.supabase);
    if (tg) await tgApi(tg.config.token, "deleteWebhook", {}).catch(() => undefined);
    await context.supabase.from("integrations").delete().eq("type", "telegram");
    await audit(context, "telegram.disconnect");
    return { ok: true };
  });

/** Sends a signed test event to the live ingest endpoint with the SaaS's stored secret. */
export const sendIngestTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ saasId: z.string().uuid(), apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: saas } = await context.supabase.from("saas").select("webhook_secret_encrypted").eq("id", data.saasId).maybeSingle();
    if (!saas?.webhook_secret_encrypted) throw new Error("SaaS introuvable");
    const { decrypt, hmacHex } = await import("@/lib/server/crypto");
    const body = JSON.stringify({ event_type: "onboarding_step", external_user_id: "visionnet_test", step: "test_connexion", timestamp: Date.now(), metadata: { test: true } });
    const sig = await hmacHex(await decrypt(saas.webhook_secret_encrypted), body);
    const origin = new URL(getRequest().url).origin;
    const res = await fetch(`${origin}/api/public/ingest-event`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": data.apiKey, "x-signature": `sha256=${sig}` },
      body,
    });
    const text = await res.text();
    await audit(context, "docs.test_event", { saas_id: data.saasId, status: res.status });
    return { status: res.status, body: text.slice(0, 500) };
  });
