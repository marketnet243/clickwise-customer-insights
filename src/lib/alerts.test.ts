import { describe, expect, it } from "vitest";
import { alertTypeFor, isAlertEnabled } from "./alerts";

describe("alertTypeFor", () => {
  it("maps signup, subscription and cancellation", () => {
    expect(alertTypeFor("signup")).toBe("signup");
    expect(alertTypeFor("subscription_activated")).toBe("subscription");
    expect(alertTypeFor("subscription_cancelled")).toBe("cancellation");
  });
  it("activation only on the first onboarding step", () => {
    expect(alertTypeFor("onboarding_step", { firstOnboardingStep: true })).toBe("activation");
    expect(alertTypeFor("onboarding_step", { firstOnboardingStep: false })).toBeNull();
  });
  it("blocked when metadata.blocked is true", () => {
    expect(alertTypeFor("onboarding_step", { metadata: { blocked: true } })).toBe("blocked");
  });
});

describe("isAlertEnabled", () => {
  it("defaults to enabled and respects a disabled rule", () => {
    expect(isAlertEnabled([], "s1", "signup")).toBe(true);
    expect(isAlertEnabled([{ saas_id: "s1", event_type: "signup", enabled: false }], "s1", "signup")).toBe(false);
  });
});
