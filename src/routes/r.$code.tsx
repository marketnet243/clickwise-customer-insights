import { createFileRoute } from "@tanstack/react-router";

// Public tracking redirect: records the click (hashed IP) then redirects to the SaaS with ?vn_ref=<code>.
export const Route = createFileRoute("/r/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const code = params.code;
        if (!/^[A-Za-z0-9_-]{4,16}$/.test(code)) return new Response("Lien invalide", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pepperedHash } = await import("@/lib/server/crypto");
        const { data: link } = await supabaseAdmin
          .from("tracking_links")
          .select("id, saas:saas_id(url)")
          .eq("code", code)
          .maybeSingle();
        const saasUrl = (link?.saas as { url: string } | null)?.url;
        if (!link || !saasUrl) return new Response("Lien introuvable", { status: 404 });

        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
        await supabaseAdmin.from("clicks").insert({
          link_id: link.id,
          ip_hash: ip ? await pepperedHash(ip) : null,
          user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
          referrer: request.headers.get("referer")?.slice(0, 500) ?? null,
          country: request.headers.get("cf-ipcountry"),
        });

        const target = new URL(saasUrl);
        target.searchParams.set("vn_ref", code);
        return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
      },
    },
  },
});
