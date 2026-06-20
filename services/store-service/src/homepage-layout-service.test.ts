import { describe, expect, it } from "vitest";
import { createDefaultHomepageLayout, type HomepageLayout } from "@commerce/contracts";
import { HomepageLayoutService, type HomepageLayoutRepository } from "./homepage-layout-service.js";

class MemoryRepository implements HomepageLayoutRepository {
  value: HomepageLayout | null = null;
  actor = "";

  async find() {
    return this.value;
  }

  async save(layout: HomepageLayout, actor: string) {
    this.value = layout;
    this.actor = actor;
    return layout;
  }
}

describe("HomepageLayoutService", () => {
  it("returns the complete default layout when the store has no saved record", async () => {
    const service = new HomepageLayoutService(new MemoryRepository());

    const layout = await service.get();

    expect(layout.modules.map((module) => module.type)).toEqual([
      "announcement", "header", "hero", "artisanStory", "categoryGrid",
      "limitedCollection", "materialDetails", "testimonials", "newsletter", "footer"
    ]);
  });

  it("saves a draft without publishing and records the admin actor", async () => {
    const repository = new MemoryRepository();
    const service = new HomepageLayoutService(repository);
    const layout = createDefaultHomepageLayout();

    const saved = await service.save(layout, "admin@example.com", false);

    expect(saved.publishedAt).toBeNull();
    expect(saved.updatedAt).not.toBe(layout.updatedAt);
    expect(repository.actor).toBe("admin@example.com");
  });

  it("publishes the normalized layout with a publication timestamp", async () => {
    const repository = new MemoryRepository();
    const service = new HomepageLayoutService(repository);
    const layout = createDefaultHomepageLayout();

    const saved = await service.save({ ...layout, modules: [...layout.modules].reverse() }, "publisher", true);

    expect(saved.publishedAt).not.toBeNull();
    expect(saved.modules[0]?.type).toBe("announcement");
  });
});
