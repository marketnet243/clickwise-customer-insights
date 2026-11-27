import { describe, expect, it } from "vitest";
import { conversionRate, generateCode } from "./channels";

describe("tracking links", () => {
  it("generates codes accepted by the DB constraint (4-16 url-safe chars)", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[A-Za-z0-9_-]{4,16}$/);
  });
  it("conversion = signups / clicks, 0 when no click", () => {
    expect(conversionRate(5, 20)).toBe(25);
    expect(conversionRate(3, 0)).toBe(0);
  });
});
