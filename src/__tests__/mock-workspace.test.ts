import { describe, it, expect } from "vitest";
import { MockWorkspace } from "../io/mock-workspace.js";

describe("MockWorkspace", () => {
  it("createCaseDir returns investigations/<caseId> path", async () => {
    const ws = new MockWorkspace();
    const dir = await ws.createCaseDir("case-1");
    expect(dir).toBe("investigations/case-1");
    expect(ws.dirs.has("investigations/case-1")).toBe(true);
  });

  it("caseMdPath returns <caseDir>/case.md", () => {
    const ws = new MockWorkspace();
    expect(ws.caseMdPath("investigations/case-1")).toBe("investigations/case-1/case.md");
  });

  it("writeFile and readFile round-trip", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("test.txt", "hello");
    expect(await ws.readFile("test.txt")).toBe("hello");
  });

  it("readFile throws for missing file", async () => {
    const ws = new MockWorkspace();
    await expect(ws.readFile("missing.txt")).rejects.toThrow("ENOENT");
  });

  it("writeFile overwrites existing content", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("test.txt", "first");
    await ws.writeFile("test.txt", "second");
    expect(await ws.readFile("test.txt")).toBe("second");
  });

  it("appendFile appends to existing content", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("test.txt", "hello");
    await ws.appendFile("test.txt", " world");
    expect(await ws.readFile("test.txt")).toBe("hello world");
  });

  it("appendFile creates file if it does not exist", async () => {
    const ws = new MockWorkspace();
    await ws.appendFile("new.txt", "content");
    expect(await ws.readFile("new.txt")).toBe("content");
  });

  it("fileExists returns true for existing file", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("test.txt", "");
    expect(await ws.fileExists("test.txt")).toBe(true);
  });

  it("fileExists returns false for missing file", async () => {
    const ws = new MockWorkspace();
    expect(await ws.fileExists("missing.txt")).toBe(false);
  });

  it("listThemeFiles returns sorted theme files only", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/c-1/theme-02-persons.md", "...");
    await ws.writeFile("investigations/c-1/theme-01-contracts.md", "...");
    await ws.writeFile("investigations/c-1/report.md", "...");
    await ws.writeFile("investigations/c-1/case.md", "...");

    const themes = await ws.listThemeFiles("investigations/c-1");
    expect(themes).toEqual(["theme-01-contracts.md", "theme-02-persons.md"]);
  });

  it("listThemeFiles returns empty array when no themes", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/c-1/report.md", "...");
    expect(await ws.listThemeFiles("investigations/c-1")).toEqual([]);
  });

  it("listThemeFiles excludes files in subdirectories", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/c-1/sub/theme-01-x.md", "...");
    expect(await ws.listThemeFiles("investigations/c-1")).toEqual([]);
  });

  it("saveState and loadState round-trip", async () => {
    const ws = new MockWorkspace();
    const state = { status: "planning", items: [1, 2, 3] };
    await ws.saveState("investigations/c-1", state);
    const loaded = await ws.loadState("investigations/c-1");
    expect(loaded).toEqual(state);
  });

  it("loadState returns null when no state exists", async () => {
    const ws = new MockWorkspace();
    expect(await ws.loadState("investigations/c-1")).toBeNull();
  });

  it("loadPromptTemplate returns stored prompt", () => {
    const ws = new MockWorkspace();
    ws.prompts.set("planner", "You are a planner agent {{CASE_ID}}");
    expect(ws.loadPromptTemplate("planner")).toBe("You are a planner agent {{CASE_ID}}");
  });

  it("loadPromptTemplate throws for missing prompt", () => {
    const ws = new MockWorkspace();
    expect(() => ws.loadPromptTemplate("missing")).toThrow("Prompt template not found: missing");
  });
});
