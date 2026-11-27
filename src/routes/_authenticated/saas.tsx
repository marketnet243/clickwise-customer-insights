import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Boxes, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createSaas, deleteSaas, regenerateSaasCredentials, saasInput } from "@/lib/saas.functions";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { CopyField } from "@/components/app/copy-field";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/saas")({
  head: () => ({
    meta: [
      { title: "SaaS connectés · VisionNet" },
      { name: "description", content: "SaaS connectés — VisionNet" },
      { property: "og:title", content: "SaaS connectés · VisionNet" },
      { property: "og:description", content: "SaaS connectés — VisionNet" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

export const saasListQuery = {
  queryKey: ["saas"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("saas")
      .select("id, name, url, logo_url, api_key_prefix, last_event_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};

function connectionStatus(last: string | null) {
  if (!last) return { tone: "neutral" as const, label: "En attente" };
  const age = Date.now() - new Date(last).getTime();
  if (age < 24 * 3600 * 1000) return { tone: "success" as const, label: "Actif" };
  if (age < 7 * 24 * 3600 * 1000) return { tone: "warning" as const, label: "Inactif" };
  return { tone: "danger" as const, label: "Silencieux" };
}

type Secrets = { name: string; apiKey: string; webhookSecret: string };

function Page() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(saasListQuery);
  const [open, setOpen] = useState(false);
  const [secrets, setSecrets] = useState<Secrets | null>(null);

  const regen = useMutation({
    mutationFn: (s: { id: string; name: string }) => regenerateSaasCredentials({ data: { id: s.id } }).then((r) => ({ ...r, name: s.name })),
    onSuccess: (r) => { setSecrets(r); qc.invalidateQueries({ queryKey: ["saas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSaas({ data: { id } }),
    onSuccess: () => { toast.success("SaaS supprimé"); qc.invalidateQueries({ queryKey: ["saas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="SaaS connectés" actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" />Ajouter</Button>} />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={Boxes} title="Aucun SaaS" action={<Button variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Ajouter un SaaS</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => {
            const st = connectionStatus(s.last_event_at);
            return (
              <Card key={s.id} className="gap-4 p-5">
                <div className="flex items-center gap-3">
                  {s.logo_url ? (
                    <img src={s.logo_url} alt="" className="size-10 rounded-lg border object-cover" />
                  ) : (
                    <div className="grid size-10 place-items-center rounded-lg bg-primary/10 font-semibold text-primary">{s.name.slice(0, 1).toUpperCase()}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.name}</div>
                    <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted-foreground hover:underline">{s.url.replace(/^https?:\/\//, "")}</a>
                  </div>
                  <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>Clé : <code className="font-mono">{s.api_key_prefix}…</code></div>
                  <div>Dernier événement : {s.last_event_at ? formatDistanceToNow(new Date(s.last_event_at), { addSuffix: true, locale: fr }) : "—"}</div>
                </div>
                <div className="flex gap-2">
                  <ConfirmDialog
                    title="Régénérer les clés ?"
                    description="L'ancienne clé API et l'ancien secret cesseront immédiatement de fonctionner."
                    confirmLabel="Régénérer"
                    onConfirm={() => regen.mutate({ id: s.id, name: s.name })}
                    trigger={<Button variant="outline" size="sm" className="flex-1" disabled={regen.isPending}><KeyRound className="size-4" />Régénérer</Button>}
                  />
                  <ConfirmDialog
                    title={`Supprimer ${s.name} ?`}
                    description="Liens, clics et événements associés seront supprimés."
                    confirmLabel="Supprimer"
                    destructive
                    onConfirm={() => del.mutate(s.id)}
                    trigger={<Button variant="ghost" size="icon" aria-label="Supprimer"><Trash2 className="size-4" /></Button>}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddSaasDialog open={open} onOpenChange={setOpen} onCreated={(s) => { setSecrets(s); qc.invalidateQueries({ queryKey: ["saas"] }); }} />
      <SecretsDialog secrets={secrets} onClose={() => setSecrets(null)} />
    </>
  );
}

function AddSaasDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (s: Secrets) => void }) {
  const [form, setForm] = useState({ name: "", url: "", logo_url: "" });
  const m = useMutation({
    mutationFn: (v: typeof form) => createSaas({ data: v }).then((r) => ({ ...r, name: v.name })),
    onSuccess: (r) => { onOpenChange(false); setForm({ name: "", url: "", logo_url: "" }); onCreated(r); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = saasInput.safeParse(form);
    if (!p.success) { toast.error(p.error.issues[0]?.path[0] === "name" ? "Nom requis" : "URL invalide"); return; }
    m.mutate(form);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau SaaS</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="n">Nom</Label><Input id="n" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="MarketNet" maxLength={80} /></div>
          <div className="space-y-1.5"><Label htmlFor="u">URL</Label><Input id="u" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://marketnet.app" /></div>
          <div className="space-y-1.5"><Label htmlFor="l">Logo (URL, optionnel)</Label><Input id="l" type="url" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending ? "Création…" : "Créer"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretsDialog({ secrets, onClose }: { secrets: Secrets | null; onClose: () => void }) {
  return (
    <Dialog open={!!secrets} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Clés de {secrets?.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Affichées une seule fois. Copiez-les maintenant.</p>
        {secrets ? (
          <div className="space-y-3">
            <CopyField label="Clé API (x-api-key)" value={secrets.apiKey} />
            <CopyField label="Secret de webhook (signature HMAC)" value={secrets.webhookSecret} />
          </div>
        ) : null}
        <DialogFooter><Button onClick={onClose}>J'ai copié</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
