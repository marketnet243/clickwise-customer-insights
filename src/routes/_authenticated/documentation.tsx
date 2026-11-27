import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { CopyField } from "@/components/app/copy-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/documentation")({
  head: () => ({
    meta: [
      { title: "Documentation · VisionNet" },
      { name: "description", content: "Guide d'intégration de VisionNet : liens de suivi et envoi d'événements." },
      { property: "og:title", content: "Documentation · VisionNet" },
      { property: "og:description", content: "Guide d'intégration de VisionNet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs leading-relaxed">{children}</pre>;
}

const EVENTS = [
  ["signup", "Un utilisateur crée un compte sur votre SaaS."],
  ["onboarding_step", "Une étape d'onboarding est franchie (champ step requis, ex. « profil_complete »)."],
  ["subscription_activated", "L'utilisateur active un abonnement payant."],
  ["subscription_cancelled", "L'utilisateur résilie son abonnement."],
] as const;

const ERRORS = [
  ["401 missing_api_key / invalid_api_key", "En-tête x-api-key absent ou inconnu."],
  ["401 missing_signature / invalid_signature", "Signature HMAC absente ou calculée sur un autre corps."],
  ["401 stale_timestamp", "timestamp à plus de 5 minutes de l'heure serveur."],
  ["400 invalid_payload", "JSON invalide ou champ manquant (voir details)."],
  ["413 payload_too_large", "Corps supérieur à 32 Ko."],
  ["429 rate_limited", "Plus de 120 requêtes par minute pour ce SaaS."],
] as const;

function Page() {
  const [origin, setOrigin] = useState("https://votre-domaine");
  useEffect(() => setOrigin(window.location.origin), []);
  const endpoint = `${origin}/api/public/ingest-event`;

  const node = `import crypto from "node:crypto";

const body = JSON.stringify({
  event_type: "signup",
  external_user_id: user.id,
  ref_code: cookies.vn_ref ?? null, // valeur reçue via ?vn_ref=
  step: null,
  timestamp: Date.now(),
  metadata: { plan: "free" },
});

const signature = crypto
  .createHmac("sha256", process.env.VN_WEBHOOK_SECRET)
  .update(body)
  .digest("hex");

await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": process.env.VN_API_KEY,
    "x-signature": \`sha256=\${signature}\`,
  },
  body,
});`;

  const python = `import hmac, hashlib, json, time, os, requests

body = json.dumps({
    "event_type": "subscription_activated",
    "external_user_id": user_id,
    "ref_code": vn_ref,
    "timestamp": int(time.time() * 1000),
})
sig = hmac.new(os.environ["VN_WEBHOOK_SECRET"].encode(), body.encode(), hashlib.sha256).hexdigest()

requests.post("${endpoint}", data=body, headers={
    "content-type": "application/json",
    "x-api-key": os.environ["VN_API_KEY"],
    "x-signature": f"sha256={sig}",
})`;

  const curl = `BODY='{"event_type":"signup","external_user_id":"u_123","timestamp":'$(date +%s000)'}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$VN_WEBHOOK_SECRET" | sed 's/^.* //')
curl -X POST "${endpoint}" \\
  -H "content-type: application/json" \\
  -H "x-api-key: $VN_API_KEY" \\
  -H "x-signature: sha256=$SIG" \\
  -d "$BODY"`;

  const capture = `// Sur la page d'arrivée de votre SaaS
const ref = new URLSearchParams(location.search).get("vn_ref");
if (ref) document.cookie = \`vn_ref=\${ref}; path=/; max-age=\${60 * 60 * 24 * 30}\`;`;

  return (
    <>
      <PageHeader title="Documentation" />
      <div className="grid max-w-4xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Fonctionnement</CardTitle>
            <CardDescription>Du clic au client, en trois étapes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Créez un SaaS dans la page <b>SaaS</b> : vous obtenez une clé d'API et un secret de signature (affichés une seule fois).</li>
              <li>Créez des liens de suivi dans <b>Affiliation</b>. Chaque lien <code className="font-mono">{origin}/r/CODE</code> enregistre le clic puis redirige vers votre SaaS avec <code className="font-mono">?vn_ref=CODE</code>.</li>
              <li>Votre SaaS conserve <code className="font-mono">vn_ref</code> et l'envoie avec chaque événement : VisionNet relie alors inscriptions et abonnements au bon lien.</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Capturer le code de référence</CardTitle>
          </CardHeader>
          <CardContent><Code>{capture}</Code></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Envoyer un événement</CardTitle>
            <CardDescription>POST JSON signé en HMAC-SHA256 avec votre secret, depuis votre serveur uniquement.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CopyField label="Point d'entrée" value={endpoint} />
            <Tabs defaultValue="node">
              <TabsList>
                <TabsTrigger value="node">Node.js</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
              </TabsList>
              <TabsContent value="node"><Code>{node}</Code></TabsContent>
              <TabsContent value="python"><Code>{python}</Code></TabsContent>
              <TabsContent value="curl"><Code>{curl}</Code></TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground">La signature se calcule sur le corps brut exact envoyé. Un même événement (type + utilisateur + étape) renvoyé n'est compté qu'une fois.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Champs</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-1.5">
              <li><code className="font-mono">event_type</code> — requis, voir ci-dessous.</li>
              <li><code className="font-mono">external_user_id</code> — requis, identifiant de l'utilisateur chez vous (200 car. max).</li>
              <li><code className="font-mono">timestamp</code> — requis, millisecondes, secondes ou date ISO.</li>
              <li><code className="font-mono">ref_code</code> — optionnel, valeur de <code className="font-mono">vn_ref</code>.</li>
              <li><code className="font-mono">step</code> — optionnel, nom de l'étape d'onboarding.</li>
              <li><code className="font-mono">metadata</code> — optionnel, objet libre.</li>
            </ul>
            <div className="divide-y rounded-md border">
              {EVENTS.map(([k, v]) => (
                <div key={k} className="grid gap-1 p-3 sm:grid-cols-[220px_1fr]">
                  <code className="font-mono text-xs font-medium">{k}</code>
                  <span className="text-muted-foreground">{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Réponses et erreurs</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border text-sm">
              <div className="grid gap-1 p-3 sm:grid-cols-[280px_1fr]"><code className="font-mono text-xs font-medium">201 / 200 duplicate</code><span className="text-muted-foreground">Événement enregistré (201) ou déjà reçu (200, duplicate: true). linked indique si le lien a été reconnu.</span></div>
              {ERRORS.map(([k, v]) => (
                <div key={k} className="grid gap-1 p-3 sm:grid-cols-[280px_1fr]">
                  <code className="font-mono text-xs font-medium">{k}</code>
                  <span className="text-muted-foreground">{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
