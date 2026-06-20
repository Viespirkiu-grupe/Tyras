import { describe, it, expect } from "vitest";
import { fillVars } from "../io/workspace.js";

describe("fillVars", () => {
  it("replaces known variables", () => {
    expect(fillVars("Hello {{NAME}}", { NAME: "World" })).toBe("Hello World");
  });

  it("replaces multiple variables", () => {
    const result = fillVars("{{A}} and {{B}}", { A: "foo", B: "bar" });
    expect(result).toBe("foo and bar");
  });

  it("leaves unknown variables as-is", () => {
    expect(fillVars("{{KNOWN}} {{UNKNOWN}}", { KNOWN: "yes" })).toBe("yes {{UNKNOWN}}");
  });

  it("handles empty vars", () => {
    expect(fillVars("{{X}}", {})).toBe("{{X}}");
  });

  it("handles template with no variables", () => {
    expect(fillVars("no vars here", { X: "y" })).toBe("no vars here");
  });

  it("replaces duplicate variables", () => {
    expect(fillVars("{{X}} {{X}}", { X: "a" })).toBe("a a");
  });

  it("only matches word characters in variable names", () => {
    expect(fillVars("{{foo-bar}}", { "foo-bar": "nope" })).toBe("{{foo-bar}}");
  });
});
