import { describe, expect, it } from "vitest";
import { addLedgers, formatLedger, pageNameOf, parseArgs } from "@/lib/dm/libraryCli";

const argv = ["--dir", "pages", "--source", "ddb:mm-2024", "--edition", "2024", "--url", "https://portal.example", "--token", "ptx_abc"];

describe("parseArgs", () => {
  it("reads every flag, with dry-run off by default", () => {
    expect(parseArgs(argv)).toEqual({ dir: "pages", source: "ddb:mm-2024", edition: "2024", url: "https://portal.example", token: "ptx_abc", dryRun: false });
    expect(parseArgs([...argv, "--dry-run"]).dryRun).toBe(true);
  });

  it("strips a trailing slash from the portal URL", () => {
    expect(parseArgs(argv.map((a) => (a === "https://portal.example" ? "https://portal.example/" : a))).url).toBe("https://portal.example");
  });

  it("throws naming a missing flag, a bad edition, a bad source or a non-https portal", () => {
    expect(() => parseArgs(argv.slice(2))).toThrow(/--dir/);
    expect(() => parseArgs(argv.map((a) => (a === "2024" ? "2025" : a)))).toThrow(/--edition/);
    expect(() => parseArgs(argv.map((a) => (a === "ddb:mm-2024" ? "mm-2024" : a)))).toThrow(/--source/);
    expect(() => parseArgs(argv.map((a) => (a === "https://portal.example" ? "http://portal.example" : a)))).toThrow(/https/);
  });

  it("allows plain http for localhost", () => {
    expect(parseArgs(argv.map((a) => (a === "https://portal.example" ? "http://localhost:3000" : a))).url).toBe("http://localhost:3000");
  });
});

describe("pageNameOf", () => {
  it("takes the part after the first underscore, without .html", () => {
    expect(pageNameOf("mm-2024_monsters-a.html")).toBe("monsters-a");
    expect(pageNameOf("mm-2024_animals.html")).toBe("animals");
  });
});

describe("formatLedger", () => {
  const a = { received: 2, created: 1, updated: 0, superseding: 1, needsReview: [{ name: "Wordy", reason: "actions.0.desc: too long" }] };
  const b = { received: 3, created: 2, updated: 1, superseding: 2, needsReview: [] };

  it("adds ledgers together", () => {
    expect(addLedgers(a, b)).toEqual({ received: 5, created: 3, updated: 1, superseding: 3, needsReview: a.needsReview });
  });

  it("prints the counts and every name that needs review", () => {
    const text = formatLedger(addLedgers(a, b));
    expect(text).toContain("received 5");
    expect(text).toContain("created 3");
    expect(text).toContain("updated 1");
    expect(text).toContain("replacing SRD 3");
    expect(text).toContain("Wordy: actions.0.desc: too long");
  });
});
