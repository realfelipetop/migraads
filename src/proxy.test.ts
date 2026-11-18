import { describe, expect, it } from "vitest";
import { hostAllowed } from "./proxy";

describe("proteção contra DNS rebinding", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST:3000", "localhost"])("aceita %s", (h) => {
    expect(hostAllowed(h)).toBe(true);
  });
  it.each(["site-malicioso.com", "site-malicioso.com:3000", "127.0.0.1.site.com:3000", "localhost.evil.com", "", null])("bloqueia %s", (h) => {
    expect(hostAllowed(h)).toBe(false);
  });
});
