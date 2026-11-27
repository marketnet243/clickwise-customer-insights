import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageCircle, Send, Unplug, Webhook } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createTelegramLinkCode, disconnectTelegram, getTelegramStatus, saveTelegramToken, sendTelegramTest } from "@/lib/telegram.functions";
import { ALERT_TYPES, isAlertEnabled, type AlertType } from "@/lib/alerts";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { CopyField } from "@/components/app/copy-field";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Intégrations · VisionNet" },
      { name: "description", content: "Intégrations — VisionNet" },
      { property: "og:title", content: "Intégrations · VisionNet" },
      { property: "og:description", content: "Intégrations — VisionNet" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Intégrations" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TelegramCard />
        <div className="grid content-start gap-4">
          {[{ icon: Mail, name: "Email" }, { icon: MessageCircle, name: "WhatsApp" }, { icon: Webhook, name: "Webhook sortant" }].map((i) => (
            <Card key={i.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 opacity-70">
              <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><i.icon className="size-4" /></div>
              <div className="truncate font-medium">{i.name}</div>
              <StatusBadge tone="neutral">Bientôt</StatusBadge>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

function TelegramCard() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getTelegramStatus);
  const saveFn = useServerFn(saveTelegramToken);
  const codeFn = useServerFn(createTelegramLinkCode);
  const testFn = useServerFn(sendTelegramTest);
  const discFn = useServerFn(disconnectTelegram);
  const { data, isLoading } = useQuery({ queryKey: ["telegram"], queryFn: () => statusFn(), refetchInterval: (q) => (q.state.data?.configured && q.state.data.pending ? 4000 : false) });
  const [token, setToken] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["telegram"] });
  const onErr = (e: Error) => toast.error(e.message);

  const save = useMutation({ mutationFn: () => saveFn({ data: { token } }), onSuccess: () => { setToken(""); toast.success("Bot enregistré"); refresh(); }, onError: onErr });
  const code = useMutation({ mutationFn: () => codeFn(), onSuccess: refresh, onError: onErr });
  const test = useMutation({ mutationFn: () => testFn(), onSuccess: () => toast.success("Message envoyé"), onError: onErr });
  const disc = useMutation({ mutationFn: () => discFn(), onSuccess: () => { toast.success("Telegram déconnecté"); refresh(); }, onError: onErr });

  const status = !data?.configured ? { tone: "neutral" as const, label: "Non configuré" } : data.status === "active" ? { tone: "success" as const, label: "Actif" } : { tone: "warning" as const, label: "À lier" };

  return (
    <Card className="gap-5 p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Send className="size-5" /></div>
        <div className="min-w-0">
          <div className="truncate font-medium">Telegram</div>
          {data?.configured && data.botUsername ? <div className="truncate text-xs text-muted-foreground">@{data.botUsername}{data.chatTitle ? ` · ${data.chatTitle}` : ""}</div> : null}
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      {isLoading ? <Skeleton className="h-24" /> : !data?.configured ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Label htmlFor="tg-token">Token du bot (BotFather)</Label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input id="tg-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC…" />
            <Button type="submit" disabled={!token || save.isPending}>{save.isPending ? "…" : "Enregistrer"}</Button>
          </div>
        </form>
      ) : (
        <>
          {data.status !== "active" || data.pending ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              {data.pending ? (
                <>
                  <CopyField label={`Envoyez ce code à @${data.botUsername ?? "votre bot"}`} value={data.pending.code} />
                  <p className="text-xs text-muted-foreground">Expire à {new Date(data.pending.expires).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                </>
              ) : (
                <Button onClick={() => code.mutate()} disabled={code.isPending}>Générer un code de liaison</Button>
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {data.status === "active" ? <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}><Send className="size-4" />Envoyer un test</Button> : null}
            {data.status === "active" && !data.pending ? <Button variant="ghost" onClick={() => code.mutate()} disabled={code.isPending}>Changer de chat</Button> : null}
            <ConfirmDialog title="Déconnecter Telegram ?" description="Le token et le chat lié seront supprimés." confirmLabel="Déconnecter" destructive onConfirm={() => disc.mutate()}
              trigger={<Button variant="ghost" className="ml-auto"><Unplug className="size-4" />Déconnecter</Button>} />
          </div>
          {data.status === "active" ? <AlertRules integrationId={data.id} /> : null}
        </>
      )}
    </Card>
  );
}

function AlertRules({ integrationId }: { integrationId: string }) {
  const qc = useQueryClient();
  const { data: saas } = useQuery({ queryKey: ["saas", "names"], queryFn: async () => (await supabase.from("saas").select("id, name").order("name")).data ?? [] });
  const { data: rules } = useQuery({ queryKey: ["alert_rules", integrationId], queryFn: async () => (await supabase.from("alert_rules").select("saas_id, event_type, enabled").eq("integration_id", integrationId)).data ?? [] });
  const toggle = useMutation({
    mutationFn: async (v: { saas_id: string; event_type: AlertType; enabled: boolean }) => {
      const { error } = await supabase.from("alert_rules").upsert({ integration_id: integrationId, ...v }, { onConflict: "integration_id,saas_id,event_type" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert_rules", integrationId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  if (!saas?.length) return <p className="text-sm text-muted-foreground">Ajoutez un SaaS pour configurer les alertes.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr><th className="px-3 py-2 text-left font-medium">Alertes</th>{ALERT_TYPES.map((t) => <th key={t.value} className="px-2 py-2 font-medium">{t.label}</th>)}</tr>
        </thead>
        <tbody>
          {saas.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="max-w-40 truncate px-3 py-2 font-medium">{s.name}</td>
              {ALERT_TYPES.map((t) => (
                <td key={t.value} className="px-2 py-2 text-center">
                  <Switch aria-label={`${s.name} ${t.label}`} checked={isAlertEnabled(rules ?? [], s.id, t.value)} onCheckedChange={(c) => toggle.mutate({ saas_id: s.id, event_type: t.value, enabled: c })} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
