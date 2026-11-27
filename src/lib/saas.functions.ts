import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const saasInput = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(500),
  logo_url: z.string().trim().url().max(500).optional().or(z.literal("")),
});

async function makeCredentials() {
  const { randomToken, pepperedHash, encrypt } = await import("@/lib/server/crypto");
  const apiKey = `vn_live_${randomToken(24)}`;
  const webhookSecret = `whsec_${randomToken(32)}`;
  return {
    apiKey,
    webhookSecret,
    row: {
      api_key_hash: await pepperedHash(apiKey),
      api_key_prefix: apiKey.slice(0, 12),
      webhook_secret_encrypted: await encrypt(webhookSecret),
    },
  };
}

export const createSaas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saasInput.parse(d))
  .handler(async ({ data, context }) => {
    const creds = await makeCredentials();
    const { data: row, error } = await context.supabase
      .from("saas")
      .insert({ name: data.name, url: data.url, logo_url: data.logo_url || null, ...creds.row })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({ user_id: context.userId, action: "saas.create", details: { saas_id: row.id, name: row.name } });
    return { id: row.id, apiKey: creds.apiKey, webhookSecret: creds.webhookSecret };
  });

export const regenerateSaasCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const creds = await makeCredentials();
    const { error } = await context.supabase.from("saas").update(creds.row).eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({ user_id: context.userId, action: "saas.regenerate_keys", details: { saas_id: data.id } });
    return { apiKey: creds.apiKey, webhookSecret: creds.webhookSecret };
  });

export const deleteSaas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("saas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({ user_id: context.userId, action: "saas.delete", details: { saas_id: data.id } });
    return { ok: true };
  });
