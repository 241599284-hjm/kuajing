import { describe, expect, it } from "vitest";
import {
  createDefaultHomepageLayout,
  duplicateHomepageModule,
  moveHomepageModule,
  normalizeHomepageLayout,
  removeHomepageModule,
  toggleHomepageModule
} from "./homepage-layout.js";

describe("homepage layout", () => {
  it("normalizes module order and keeps origin-free media references", () => {
    const layout = createDefaultHomepageLayout();
    const reversed = { ...layout, modules: [...layout.modules].reverse() };

    const normalized = normalizeHomepageLayout(reversed);

    expect(normalized.modules.map((module) => module.sortOrder)).toEqual(
      normalized.modules.map((_, index) => index * 10)
    );
    expect(normalized.modules.find((module) => module.type === "hero")?.content.imageUrl)
      .toMatch(/^\//);
  });

  it("rejects insecure media references and duplicate module ids", () => {
    const layout = createDefaultHomepageLayout();
    const hero = layout.modules.find((module) => module.type === "hero");
    expect(hero).toBeDefined();

    expect(() => normalizeHomepageLayout({
      ...layout,
      modules: layout.modules.map((module) => module.id === hero?.id
        ? { ...module, content: { ...module.content, imageUrl: "http://cdn.example.com/hero.jpg" } }
        : module)
    })).toThrow("insecure HTTP");

    expect(() => normalizeHomepageLayout({
      ...layout,
      modules: [...layout.modules, layout.modules[0]]
    })).toThrow("duplicate homepage module id");
  });

  it("removes invisible and replacement characters from published copy", () => {
    const layout = createDefaultHomepageLayout();
    const normalized = normalizeHomepageLayout({
      ...layout,
      modules: layout.modules.map((module) => module.type === "hero"
        ? { ...module, content: { ...module.content, title: { en: "Clean\u200b title\ufffd", zh: "干净\u0000标题" } } }
        : module)
    });
    const title = normalized.modules.find((module) => module.type === "hero")?.content.title;

    expect(title).toEqual({ en: "Clean title", zh: "干净标题" });
  });

  it("duplicates and toggles modules without mutating the source layout", () => {
    const layout = createDefaultHomepageLayout();
    const source = layout.modules.find((module) => module.type === "artisanStory");
    expect(source).toBeDefined();

    const duplicated = duplicateHomepageModule(layout, source!.id, "artisan-copy");
    const toggled = toggleHomepageModule(duplicated, source!.id, false);

    expect(layout.modules).toHaveLength(10);
    expect(duplicated.modules).toHaveLength(11);
    expect(duplicated.modules.find((module) => module.id === "artisan-copy")?.content)
      .toEqual(source?.content);
    expect(toggled.modules.find((module) => module.id === source?.id)?.enabled).toBe(false);
  });

  it("moves and removes editable modules while protecting required shell modules", () => {
    const layout = createDefaultHomepageLayout();
    const moved = moveHomepageModule(layout, "material-details", "categories");
    const removed = removeHomepageModule(moved, "artisan-story");

    expect(moved.modules.findIndex((module) => module.id === "material-details"))
      .toBeLessThan(moved.modules.findIndex((module) => module.id === "categories"));
    expect(removed.modules.some((module) => module.id === "artisan-story")).toBe(false);
    expect(() => removeHomepageModule(layout, "header")).toThrow("required homepage module");
    expect(() => removeHomepageModule(layout, "footer")).toThrow("required homepage module");
  });
});
