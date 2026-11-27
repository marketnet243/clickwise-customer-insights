import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RATE_LIMIT_PER_MIN = 120;
const MAX_SKEW_MS = 5 * 60 * 1000;

const eventSchema = z.object({
  event_type: z.enum(["signup", "onboarding_step", "subscription_activated", "subscription_cancelled"]),
  external_user_id: z.string().trim().min(1).max(200),
  ref_code: z.string().trim().max(16).optional().nullable(),
  step: z.string().trim().max(100).optional().nullable(),
  timestamp: z.union([z.number(), z.string()]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key, x-signature",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

export const Route = createFileRoute("/api/public/ingest-event")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        const signature = request.headers.get("x-signature")?.replace(/^sha256=/, "").toLowerCase();
        if (!apiKey) return json(401, { error: "missing_api_key" });
        if (!signature) return json(401, { error: "missing_signature" });

        const raw = await request.text();
        if (raw.length > 32_000) return json(413, { error: "payload_too_large" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pepperedHash, decrypt, hmacHex, safeEqual } = await import("@/lib/server/crypto");

        const { data: saas } = await supabaseAdmin
          .from("saas")
          .select("id, webhook_secret_encrypted")
          .eq("api_key_hash", await pepperedHash(apiKey))
          .maybeSingle();
        if (!saas?.webhook_secret_encrypted) return json(401, { error: "invalid_api_key" });

        const { data: allowed } = await supabaseAdmin.rpc("bump_rate_limit", { _saas_id: saas.id, _limit: RATE_LIMIT_PER_MIN });
        if (allowed === false) return json(429, { error: "rate_limited" });

        const secret = await decrypt(saas.webhook_secret_encrypted);
        if (!safeEqual(await hmacHex(secret, raw), signature)) return json(401, { error: "invalid_signature" });

        let parsed: z.infer<typeof eventSchema>;
        try {
          parsed = eventSchema.parse(JSON.parse(raw));
        } catch (e) {
          return json(400, { error: "invalid_payload", details: e instanceof z.ZodError ? e.issues : undefined });
        }

        const ts = typeof parsed.timestamp === "number"
          ? (parsed.timestamp < 1e12 ? parsed.timestamp * 1000 : parsed.timestamp)
          : Date.parse(parsed.timestamp);
        if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return json(401, { error: "stale_timestamp" });

        let linkId: string | null = null;
        if (parsed.ref_code) {
          const { data: link } = await supabaseAdmin
            .from("tracking_links").select("id").eq("code", parsed.ref_code).eq("saas_id", saas.id).maybeSingle();
          linkId = link?.id ?? null;
        }

        const { data: inserted, error } = await supabaseAdmin
          .from("events")
          .upsert(
            {
              saas_id: saas.id,
              link_id: linkId,
              ref_code: parsed.ref_code ?? null,
              event_type: parsed.event_type,
              external_user_id: parsed.external_user_id,
              step: parsed.step ?? "",
              metadata: (parsed.metadata ?? {}) as never,
            },
            { onConflict: "saas_id,event_type,external_user_id,step", ignoreDuplicates: true },
          )
          .select("id");
        if (error) return json(500, { error: "storage_error" });

        await supabaseAdmin.from("saas").update({ last_event_at: new Date().toISOString() }).eq("id", saas.id);
        const duplicate = !inserted || inserted.length === 0;
        if (!duplicate) {
          const { notifyEvent } = await import("@/lib/server/telegram.server");
          await notifyEvent(supabaseAdmin, {
            saas_id: saas.id, event_type: parsed.event_type, external_user_id: parsed.external_user_id,
            step: parsed.step ?? "", link_id: linkId, metadata: parsed.metadata ?? {},
          });
        }
        return json(duplicate ? 200 : 201, { ok: true, duplicate, linked: !!linkId });
      },
    },
  },
});
