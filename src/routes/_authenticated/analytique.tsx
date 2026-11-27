import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Bar, BarChart, CartesianGrid, Sankey, Tooltip, XAxis, YAxis, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { BarChart3, OctagonAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { FunnelChart } from "@/components/app/funnel-chart";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { blockingStep, channelStats, funnel, sankey } from "@/lib/analytics";
import { loadAnalytics } from "@/lib/analytics-data";
import { channelLabel, conversionRate } from "@/lib/channels";

export const Route = createFileRoute("/_authenticated/analytique")({
  head: () => ({
    meta: [
      { title: "Analytique · VisionNet" },
      { name: "description", content: "Analytique — VisionNet" },
      { property: "og:title", content: "Analytique · VisionNet" },
      { property: "og:description", content: "Analytique — VisionNet" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const barConfig = {
  clicks: { label: "Clics", color: "var(--chart-1)" },
  signups: { label: "Inscriptions", color: "var(--chart-2)" },
  subscriptions: { label: "Abonnements", color: "var(--chart-3)" },
} satisfies ChartConfig;

function Page() {
  const [range, setRange] = useState<DateRange>({ from: subDays(new Date(), 29), to: new Date() });
  const [saasId, setSaasId] = useState("");
  const from = range.from ?? subDays(new Date(), 29); const to = range.to ?? from;
  const q = useQuery({ queryKey: ["analytics", from.toDateString(), to.toDateString()], queryFn: () => loadAnalytics(from, to) });
  const d = q.data;
  useEffect(() => { if (!saasId && d?.saas[0]) setSaasId(d.saas[0].id); }, [d, saasId]);

  if (!q.isLoading && !d?.saas.length) return (<><PageHeader title="Analytique" /><EmptyState icon={BarChart3} title="Ajoutez d'abord un SaaS" /></>);

  const saasLinks = d?.links.filter((l) => l.saas_id === saasId) ?? [];
  const saasLinkIds = new Set(saasLinks.map((l) => l.id));
  const steps = d && saasId ? funnel(saasId, d.links, d.clicks, d.events) : [];
  const block = d && saasId ? blockingStep(saasId, d.events) : null;
  const channels = d ? channelStats(saasLinks, d.clicks.filter((c) => saasLinkIds.has(c.link_id)), d.events.filter((e) => e.saas_id === saasId)) : [];
  const flow = d ? sankey(d.links, new Map(d.saas.map((s) => [s.id, s.name])), d.events, channelLabel) : { nodes: [], links: [] };
  const loading = q.isLoading;

  return (
    <>
      <PageHeader title="Analytique" actions={<DateRangePicker value={range} onChange={setRange} />} />
      <div className="mb-4 max-w-xs">
        <Select value={saasId} onValueChange={setSaasId}>
          <SelectTrigger aria-label="SaaS"><SelectValue placeholder="Choisir un SaaS" /></SelectTrigger>
          <SelectContent>{d?.saas.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">Entonnoir</h2>
          {loading ? <Skeleton className="h-48 w-full" /> : <FunnelChart steps={steps} />}
        </Card>
        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">Étape de blocage</h2>
          {loading ? <Skeleton className="h-20 w-full" /> : block ? (
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/15 text-warning-foreground dark:text-warning"><OctagonAlert className="size-5" /></div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{block.step}</div>
                <div className="text-sm text-muted-foreground tabular-nums">{block.users} utilisateur{block.users > 1 ? "s" : ""} bloqué{block.users > 1 ? "s" : ""}</div>
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Aucun blocage</p>}
        </Card>
      </div>

      <Card className="mt-4 gap-0 p-5">
        <h2 className="mb-4 text-sm font-medium">Performance par canal</h2>
        {loading ? <Skeleton className="h-56 w-full" /> : !channels.length ? <EmptyState title="Aucune donnée" /> : (
          <>
            <ChartContainer config={barConfig} className="h-56 w-full">
              <BarChart data={channels.map((c) => ({ ...c, name: channelLabel(c.channel) }))} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="clicks" fill="var(--color-clicks)" radius={4} />
                <Bar dataKey="signups" fill="var(--color-signups)" radius={4} />
                <Bar dataKey="subscriptions" fill="var(--color-subscriptions)" radius={4} />
              </BarChart>
            </ChartContainer>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2 font-medium">Canal</th><th className="text-right font-medium">Clics</th><th className="text-right font-medium">Inscr.</th><th className="text-right font-medium">Abo.</th><th className="text-right font-medium">Conv.</th></tr></thead>
                <tbody className="divide-y tabular-nums">
                  {channels.map((c) => (
                    <tr key={c.channel}><td className="py-2">{channelLabel(c.channel)}</td><td className="text-right">{c.clicks}</td><td className="text-right">{c.signups}</td><td className="text-right">{c.subscriptions}</td><td className="text-right">{conversionRate(c.signups, c.clicks)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card className="mt-4 gap-0 p-5">
        <h2 className="mb-4 text-sm font-medium">Cartographie source → SaaS → étape</h2>
        {loading ? <Skeleton className="h-72 w-full" /> : !flow.links.length ? <EmptyState title="Aucun parcours attribué" /> : (
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <Sankey data={flow} nodePadding={24} margin={{ top: 8, bottom: 8, left: 8, right: 110 }} link={{ stroke: "var(--chart-1)", strokeOpacity: 0.25 }} node={<FlowNode />}>
                <Tooltip />
              </Sankey>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </>
  );
}

type NodeProps = { x?: number; y?: number; width?: number; height?: number; payload?: { name: string; value: number } };
function FlowNode({ x = 0, y = 0, width = 0, height = 0, payload }: NodeProps) {
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill="var(--chart-1)" fillOpacity={0.9} radius={2} />
      <text x={x + width + 6} y={y + height / 2} dy="0.35em" fontSize={12} fill="currentColor">{payload?.name} · {payload?.value}</text>
    </Layer>
  );
}
