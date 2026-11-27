import { createFileRoute } from "@tanstack/react-router";

const ok = () => new Response("ok");

export const Route = createFileRoute("/api/public/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadTelegram, saveTelegram, tgApi } = await import("@/lib/server/telegram.server");
        const { safeEqual } = await import("@/lib/server/crypto");
        const tg = await loadTelegram(supabaseAdmin);
        if (!tg || !header || !safeEqual(header, tg.config.webhook_secret)) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json().catch(() => null)) as { message?: { text?: string; chat?: { id: number; title?: string; username?: string; first_name?: string } } } | null;
        const msg = update?.message;
        if (!msg?.chat || !msg.text) return ok();
        const text = msg.text.replace(/^\/start\s*/i, "").trim().toUpperCase();
        const c = tg.config;
        if (!c.link_code || !c.link_expires || text !== c.link_code) return ok();
        if (c.link_expires < Date.now()) {
          await tgApi(c.token, "sendMessage", { chat_id: msg.chat.id, text: "Code expiré. Générez-en un nouveau dans VisionNet." }).catch(() => undefined);
          return ok();
        }
        const chat_title = msg.chat.title ?? msg.chat.username ?? msg.chat.first_name ?? "Chat";
        await saveTelegram(supabaseAdmin, { ...c, chat_id: msg.chat.id, chat_title, link_code: undefined, link_expires: undefined }, "active");
        await supabaseAdmin.from("audit_logs").insert({ user_id: null, action: "telegram.linked", details: { chat: chat_title } });
        await tgApi(c.token, "sendMessage", { chat_id: msg.chat.id, text: "✅ VisionNet est connecté. Vous recevrez ici vos alertes." }).catch(() => undefined);
        return ok();
      },
    },
  },
});
