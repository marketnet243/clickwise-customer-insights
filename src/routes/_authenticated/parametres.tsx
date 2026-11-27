import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-auth";
import { PageHeader } from "@/components/app/page-header";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres · VisionNet" },
      { name: "description", content: "Paramètres du compte VisionNet." },
      { property: "og:title", content: "Paramètres · VisionNet" },
      { property: "og:description", content: "Paramètres du compte VisionNet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const ACTIONS: Record<string, string> = {
  "saas.create": "SaaS créé",
  "saas.delete": "SaaS supprimé",
  "saas.regenerate_keys": "Clés régénérées",
  "profile.update": "Profil modifié",
  "password.change": "Mot de passe modifié",
};

function Page() {
  const { user } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<"" | "name" | "pw">("");

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name, email").eq("id", user!.id).maybeSingle();
      return data;
    },
  });
  const logs = useQuery({
    queryKey: ["audit_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_logs").select("id, action, created_at").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => { if (profile.data?.display_name) setName(profile.data.display_name); }, [profile.data]);

  const log = (action: string) => supabase.from("audit_logs").insert({ user_id: user!.id, action, details: {} });

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim().slice(0, 80);
    if (!user) return;
    setBusy("name");
    const { error } = await supabase.from("profiles").upsert({ id: user.id, email: user.email ?? null, display_name: v || null });
    setBusy("");
    if (error) { toast.error("Enregistrement impossible"); return; }
    await log("profile.update");
    toast.success("Profil enregistré");
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["audit_logs"] });
  };

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { toast.error("8 caractères minimum"); return; }
    if (pw !== pw2) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setBusy("pw");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy("");
    if (error) { toast.error(error.message.includes("weak") || error.message.includes("pwned") ? "Mot de passe trop faible ou compromis" : "Modification impossible"); return; }
    await log("password.change");
    setPw(""); setPw2("");
    toast.success("Mot de passe modifié");
    qc.invalidateQueries({ queryKey: ["audit_logs"] });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <>
      <PageHeader title="Paramètres" />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader><CardTitle>Profil</CardTitle><CardDescription>{user?.email}</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={saveName} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="display_name">Nom affiché</Label>
                <Input id="display_name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy === "name"}>{busy === "name" ? <Loader2 className="size-4 animate-spin" /> : null}Enregistrer</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mot de passe</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={savePw} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pw">Nouveau mot de passe</Label>
                <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirmer</Label>
                <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </div>
              <div className="sm:col-span-2"><Button type="submit" disabled={busy === "pw"}>{busy === "pw" ? <Loader2 className="size-4 animate-spin" /> : null}Changer le mot de passe</Button></div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Apparence et session</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm">Thème clair / sombre <ThemeToggle /></div>
            <Button variant="outline" className="ml-auto" onClick={signOut}>Se déconnecter</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Journal d'activité</CardTitle><CardDescription>Les 20 dernières actions.</CardDescription></CardHeader>
          <CardContent>
            {logs.isLoading ? <Loader2 className="size-4 animate-spin" /> : !logs.data?.length ? (
              <p className="text-sm text-muted-foreground">Aucune activité pour l'instant.</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {logs.data.map((l) => (
                  <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
                    <span className="min-w-0 truncate">{ACTIONS[l.action] ?? l.action}</span>
                    <span className="shrink-0 text-muted-foreground">{new Date(l.created_at).toLocaleString("fr-FR")}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
