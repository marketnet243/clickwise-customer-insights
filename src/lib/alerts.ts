// Client-safe alert definitions shared by /integrations and the server notifier.
export const ALERT_TYPES = [
  { value: "signup", label: "Inscription" },
  { value: "activation", label: "Activation" },
  { value: "subscription", label: "Abonnement" },
  { value: "cancellation", label: "Annulation" },
  { value: "blocked", label: "Blocage" },
] as const;
export type AlertType = (typeof ALERT_TYPES)[number]["value"];

/**
 * Maps an ingested event to the alert it triggers.
 * Activation = the user's first onboarding step. Blocage = onboarding_step with metadata.blocked === true.
 */
export function alertTypeFor(
  eventType: string,
  opts: { firstOnboardingStep?: boolean; metadata?: Record<string, unknown> } = {},
): AlertType | null {
  switch (eventType) {
    case "signup": return "signup";
    case "subscription_activated": return "subscription";
    case "subscription_cancelled": return "cancellation";
    case "onboarding_step":
      if (opts.metadata?.["blocked"] === true) return "blocked";
      return opts.firstOnboardingStep ? "activation" : null;
    default: return null;
  }
}

/** A missing rule counts as enabled, so alerts work right after linking the bot. */
export function isAlertEnabled(rules: { saas_id: string | null; event_type: string; enabled: boolean }[], saasId: string, type: AlertType) {
  const r = rules.find((x) => x.saas_id === saasId && x.event_type === type);
  return r ? r.enabled : true;
}

export function formatAlert(p: { saas: string; type: AlertType; channel?: string | null; step?: string | null; at: Date }) {
  const label = ALERT_TYPES.find((t) => t.value === p.type)?.label ?? p.type;
  const time = p.at.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
  const lines = [`🔔 ${p.saas} · ${label}`];
  if (p.step) lines.push(`Étape : ${p.step}`);
  lines.push(`Canal : ${p.channel ?? "Direct"}`, `Heure : ${time}`);
  return lines.join("\n");
}
