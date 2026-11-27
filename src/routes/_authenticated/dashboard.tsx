import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { subDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { MousePointerClick, UserPlus, Zap, CreditCard, Percent, LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { StatusBadge } from "@/components/app/status-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { channelStats, dailySeries, kpis } from "@/lib/analytics";
import { loadAnalytics } from "@/lib/analytics-data";
import { channelLabel } from "@/lib/channels";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord · VisionNet" },
      { name: "description", content: "Tableau de bord — VisionNet" },
      { property: "og:title", content: "Tableau de bord · VisionNet" },
      { property: "og:description", content: "Tableau de bord — VisionNet" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const chartConfig = {
  clics: { label: "Clics", color: "var(--chart-1)" },
  inscriptions: { label: "Inscriptions", color: "var(--chart-2)" },
  abonnements: { label: "Abonnements", color: "var(--chart-3)" },
} satisfies ChartConfig;

const EVENT_LABEL: Record<string, string> = {
  signup: "Inscription", onboarding_step: "Étape", subscription_activated: "Abonnement", subscription_cancelled: "Annulation",
};
const EVENT_TONE: Record<string, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  signup: "primary", onboarding_step: "neutral", subscription_activated: "success", subscription_cancelled: "danger",
};

function Page() {
  const [range, setRange] = useState<DateRange>({ from: subDays(new Date(), 29), to: new Date() });
  const from = range.from ?? subDays(new Date(), 29); const to = range.to ?? from;
  const q = useQuery({ queryKey: ["analytics", from.toDateString(), to.toDateString()], queryFn: () => loadAnalytics(from, to) });
  const d = q.data;
  const k = d ? kpis(d.clicks, d.events) : null;
  const series = d ? dailySeries(from, to, d.clicks, d.events) : [];
  const sources = d ? channelStats(d.links, d.clicks, d.events).slice(0, 5) : [];
  const saasName = new Map(d?.saas.map((s) => [s.id, s.name]));
  const recent = d ? [...d.events].reverse().slice(0, 8) : [];
  const loading = q.isLoading;

  return (
    <>
      <PageHeader title="Tableau de bord" actions={<DateRangePicker value={range} onChange={setRange} />} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Clics" value={k?.clicks.toLocaleString("fr-FR") ?? 0} icon={MousePointerClick} loading={loading} />
        <StatCard label="Inscriptions" value={k?.signups.toLocaleString("fr-FR") ?? 0} icon={UserPlus} loading={loading} />
        <StatCard label="Activations" value={k?.activations.toLocaleString("fr-FR") ?? 0} icon={Zap} loading={loading} />
        <StatCard label="Abonnements" value={k?.subscriptions.toLocaleString("fr-FR") ?? 0} icon={CreditCard} loading={loading} />
        <StatCard label="Conversion" value={`${k?.conversion ?? 0}%`} icon={Percent} loading={loading} />
      </div>

      <Card className="mt-4 gap-0 p-5">
        <h2 className="mb-4 text-sm font-medium">Évolution</h2>
        {loading ? <Skeleton className="h-64 w-full" /> : (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <AreaChart data={series} margin={{ left: -20, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(v: string) => format(new Date(v), "d MMM", { locale: fr })} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {(["clics", "inscriptions", "abonnements"] as const).map((key) => (
                <Area key={key} dataKey={key} type="monotone" stroke={`var(--color-${key})`} fill={`var(--color-${key})`} fillOpacity={0.12} strokeWidth={2} />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">Top sources</h2>
          {loading ? <Skeleton className="h-40 w-full" /> : !sources.length ? <EmptyState icon={LayoutDashboard} title="Aucune donnée" /> : (
            <ul className="divide-y text-sm">
              {sources.map((s) => (
                <li key={s.channel} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5">
                  <span className="truncate">{channelLabel(s.channel)}</span>
                  <span className="tabular-nums text-muted-foreground">{s.clicks} clics · {s.signups} inscr. · {s.subscriptions} abo.</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">Derniers événements</h2>
          {loading ? <Skeleton className="h-40 w-full" /> : !recent.length ? <EmptyState title="Aucun événement" /> : (
            <ul className="divide-y text-sm">
              {recent.map((e, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{saasName.get(e.saas_id) ?? "SaaS"}{e.step ? <span className="font-normal text-muted-foreground"> · {e.step}</span> : null}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(e.created_at), "d MMM HH:mm", { locale: fr })}</div>
                  </div>
                  <StatusBadge tone={EVENT_TONE[e.event_type] ?? "neutral"}>{EVENT_LABEL[e.event_type] ?? e.event_type}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
