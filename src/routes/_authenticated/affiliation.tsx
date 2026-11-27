import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { CHANNELS, type Channel, channelLabel, conversionRate, generateCode } from "@/lib/channels";
import { saasListQuery } from "./saas";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable, type Column } from "@/components/app/data-table";
import { CopyField } from "@/components/app/copy-field";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/affiliation")({
  head: () => ({
    meta: [
      { title: "Affiliation · VisionNet" },
      { name: "description", content: "Affiliation — VisionNet" },
      { property: "og:title", content: "Affiliation · VisionNet" },
      { property: "og:description", content: "Affiliation — VisionNet" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const linkInput = z.object({
  name: z.string().trim().min(1).max(80),
  channel: z.enum(["facebook", "whatsapp", "telegram", "tiktok", "instagram", "youtube", "other"]),
  campaign: z.string().trim().max(80).optional(),
});

type LinkRow = { id: string; code: string; name: string; channel: string; campaign: string | null; clicks: number; signups: number; activations: number };

function Page() {
  const qc = useQueryClient();
  const saasQ = useQuery(saasListQuery);
  const [saasId, setSaasId] = useState<string>("");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!saasId && saasQ.data?.[0]) setSaasId(saasQ.data[0].id); }, [saasQ.data, saasId]);

  const linksQ = useQuery({
    queryKey: ["links", saasId],
    enabled: !!saasId,
    queryFn: async (): Promise<LinkRow[]> => {
      const [{ data: links, error }, { data: stats }] = await Promise.all([
        supabase.from("tracking_links").select("id, code, name, channel, campaign").eq("saas_id", saasId).order("created_at", { ascending: false }),
        supabase.rpc("link_stats", { _saas_id: saasId }),
      ]);
      if (error) throw error;
      const byId = new Map((stats ?? []).map((s) => [s.link_id, s]));
      return (links ?? []).map((l) => {
        const s = byId.get(l.id);
        return { ...l, clicks: Number(s?.clicks ?? 0), signups: Number(s?.signups ?? 0), activations: Number(s?.activations ?? 0) };
      });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tracking_links").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Lien supprimé"); qc.invalidateQueries({ queryKey: ["links", saasId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const columns: Column<LinkRow>[] = useMemo(() => [
    { key: "name", header: "Lien", cell: (r) => (
      <div className="min-w-0"><div className="font-medium">{r.name}</div>{r.campaign ? <div className="text-xs text-muted-foreground">{r.campaign}</div> : null}</div>
    ) },
    { key: "channel", header: "Canal", cell: (r) => <StatusBadge tone="primary" dot={false}>{channelLabel(r.channel)}</StatusBadge> },
    { key: "url", header: "URL", className: "min-w-56", cell: (r) => <CopyField value={`${origin}/r/${r.code}`} /> },
    { key: "clicks", header: "Clics", className: "text-right tabular-nums", cell: (r) => r.clicks },
    { key: "signups", header: "Inscr.", className: "text-right tabular-nums", cell: (r) => r.signups },
    { key: "act", header: "Activ.", className: "text-right tabular-nums", cell: (r) => r.activations },
    { key: "conv", header: "Conv.", className: "text-right tabular-nums", cell: (r) => `${conversionRate(r.signups, r.clicks)}%` },
    { key: "x", header: "", cell: (r) => (
      <ConfirmDialog title="Supprimer ce lien ?" confirmLabel="Supprimer" destructive onConfirm={() => del.mutate(r.id)}
        trigger={<Button variant="ghost" size="icon" aria-label="Supprimer"><Trash2 className="size-4" /></Button>} />
    ) },
  ], [origin, del]);

  if (!saasQ.isLoading && !saasQ.data?.length) {
    return (<><PageHeader title="Affiliation" /><EmptyState icon={Link2} title="Ajoutez d'abord un SaaS" /></>);
  }

  return (
    <>
      <PageHeader title="Affiliation" actions={<Button onClick={() => setOpen(true)} disabled={!saasId}><Plus className="size-4" />Nouveau lien</Button>} />
      <div className="mb-4 max-w-xs">
        <Select value={saasId} onValueChange={setSaasId}>
          <SelectTrigger aria-label="SaaS"><SelectValue placeholder="Choisir un SaaS" /></SelectTrigger>
          <SelectContent>{saasQ.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} rows={linksQ.data ?? []} loading={saasQ.isLoading || linksQ.isLoading} rowKey={(r) => r.id} empty="Aucun lien" />
      <NewLinkDialog open={open} onOpenChange={setOpen} saasId={saasId} origin={origin} onCreated={() => qc.invalidateQueries({ queryKey: ["links", saasId] })} />
    </>
  );
}

function NewLinkDialog({ open, onOpenChange, saasId, origin, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; saasId: string; origin: string; onCreated: () => void }) {
  const [form, setForm] = useState<{ name: string; channel: Channel; campaign: string }>({ name: "", channel: "facebook", campaign: "" });
  const [created, setCreated] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const p = linkInput.parse(form);
      for (let i = 0; i < 3; i++) {
        const code = generateCode();
        const { error } = await supabase.from("tracking_links").insert({ saas_id: saasId, code, name: p.name, channel: p.channel, campaign: p.campaign || null });
        if (!error) return code;
        if (error.code !== "23505") throw error;
      }
      throw new Error("Réessayez");
    },
    onSuccess: (code) => { setCreated(code); onCreated(); },
    onError: (e: Error) => toast.error(e instanceof z.ZodError ? "Nom requis" : e.message),
  });
  const close = (o: boolean) => { if (!o) { setCreated(null); setForm({ name: "", channel: "facebook", campaign: "" }); } onOpenChange(o); };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader><DialogTitle>{created ? "Lien généré" : "Nouveau lien"}</DialogTitle></DialogHeader>
        {created ? (
          <>
            <CopyField value={`${origin}/r/${created}`} />
            <DialogFooter><Button onClick={() => close(false)}>Terminé</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="ln">Nom</Label><Input id="ln" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Groupe FB Entrepreneurs" maxLength={80} /></div>
            <div className="space-y-1.5"><Label>Canal</Label>
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as Channel })}>
                <SelectTrigger aria-label="Canal"><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="lc">Campagne (optionnel)</Label><Input id="lc" value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} maxLength={80} /></div>
            <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending ? "Génération…" : "Générer"}</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
