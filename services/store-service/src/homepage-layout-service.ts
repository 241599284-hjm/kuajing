import {
  createDefaultHomepageLayout,
  normalizeHomepageLayout,
  type HomepageLayout
} from "@commerce/contracts";
import type { Pool } from "pg";

export interface HomepageLayoutRepository {
  find(): Promise<HomepageLayout | null>;
  save(layout: HomepageLayout, actor: string): Promise<HomepageLayout>;
}

export class HomepageLayoutService {
  constructor(private readonly repository: HomepageLayoutRepository) {}

  async get() {
    return (await this.repository.find()) ?? createDefaultHomepageLayout();
  }

  async save(layout: HomepageLayout, actor: string, publish: boolean) {
    const now = new Date().toISOString();
    const normalized = normalizeHomepageLayout({
      ...layout,
      updatedAt: now,
      publishedAt: publish ? now : layout.publishedAt
    });
    return this.repository.save(normalized, actor);
  }
}

export class PgHomepageLayoutRepository implements HomepageLayoutRepository {
  constructor(
    private readonly pool: Pool,
    private readonly storeId: string
  ) {}

  async find() {
    const result = await this.pool.query<{ layout: HomepageLayout }>(
      "SELECT layout FROM homepage_layouts WHERE store_id = $1",
      [this.storeId]
    );
    return result.rows[0]?.layout ?? null;
  }

  async save(layout: HomepageLayout, actor: string) {
    const result = await this.pool.query<{ layout: HomepageLayout }>(
      `INSERT INTO homepage_layouts (store_id, layout, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (store_id) DO UPDATE
       SET layout = EXCLUDED.layout, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING layout`,
      [this.storeId, JSON.stringify(layout), actor]
    );
    return result.rows[0]?.layout ?? layout;
  }
}
