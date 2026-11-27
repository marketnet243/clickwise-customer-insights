import { describe, expect, it } from "vitest";
import { blockingStep, funnel, kpis, type EventRow } from "./analytics";

const ev = (u: string, t: string, step = "", link: string | null = "l1"): EventRow =>
  ({ saas_id: "s1", link_id: link, event_type: t, external_user_id: u, step, created_at: new Date().toISOString() });

describe("analytics", () => {
  it("conversion = subscriptions / clicks", () => {
    const k = kpis([{ link_id: "l1", created_at: "" }, { link_id: "l1", created_at: "" }], [ev("a", "signup"), ev("a", "subscription_activated")]);
    expect(k).toMatchObject({ clicks: 2, signups: 1, subscriptions: 1, conversion: 50 });
  });
  it("funnel goes clicks → signups → steps → paid", () => {
    const f = funnel("s1", [{ id: "l1", saas_id: "s1", channel: "facebook", name: "x" }], [{ link_id: "l1", created_at: "" }],
      [ev("a", "signup"), ev("b", "signup"), ev("a", "onboarding_step", "profil"), ev("a", "subscription_activated")]);
    expect(f.map((s) => s.value)).toEqual([1, 2, 1, 1]);
  });
  it("blocking step = most frequent last step of non-subscribers", () => {
    const b = blockingStep("s1", [ev("a", "signup"), ev("a", "onboarding_step", "profil"), ev("b", "signup"), ev("b", "onboarding_step", "profil"), ev("c", "signup")]);
    expect(b).toEqual({ step: "profil", users: 2 });
  });
});
