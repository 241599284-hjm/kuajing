import { normalizeResourceReference } from "./media-reference.js";

export type HomepageModuleType =
  | "announcement"
  | "header"
  | "hero"
  | "artisanStory"
  | "categoryGrid"
  | "limitedCollection"
  | "materialDetails"
  | "testimonials"
  | "newsletter"
  | "footer";

export type HomepageLocalizedText = { en: string; zh: string };

export type HomepageModuleContent = {
  eyebrow?: HomepageLocalizedText;
  title?: HomepageLocalizedText;
  body?: HomepageLocalizedText;
  secondaryBody?: HomepageLocalizedText;
  ctaLabel?: HomepageLocalizedText;
  ctaHref?: string;
  imageUrl?: string;
  mobileImageUrl?: string;
  categorySlugs?: string[];
  productSlugs?: string[];
  links?: Array<{ label: HomepageLocalizedText; href: string }>;
  items?: Array<{
    title: HomepageLocalizedText;
    body: HomepageLocalizedText;
    imageUrl?: string;
    author?: string;
  }>;
  columnsDesktop?: number;
  columnsMobile?: number;
  accentColor?: string;
};

export type HomepageModule = {
  id: string;
  type: HomepageModuleType;
  enabled: boolean;
  sortOrder: number;
  content: HomepageModuleContent;
};

export type HomepageLayout = {
  version: 1;
  updatedAt: string;
  publishedAt: string | null;
  modules: HomepageModule[];
};

const text = (en: string, zh: string): HomepageLocalizedText => ({ en, zh });

export function createDefaultHomepageLayout(): HomepageLayout {
  const modules: HomepageModule[] = [
    { id: "announcement", type: "announcement", enabled: true, sortOrder: 0, content: { title: text("Complimentary shipping on orders over $150", "订单满 $150 享免费配送"), ctaLabel: text("Details", "查看详情"), ctaHref: "/terms-of-service" } },
    { id: "header", type: "header", enabled: true, sortOrder: 10, content: { links: [
      { label: text("Shop", "商店"), href: "/products" },
      { label: text("Collections", "系列"), href: "/#limited-collection" },
      { label: text("Artisans", "匠人"), href: "/#artisan-story" },
      { label: text("Journal", "手记"), href: "/#material-details" }
    ] } },
    { id: "hero", type: "hero", enabled: true, sortOrder: 20, content: { eyebrow: text("Quiet objects for considered spaces", "为从容空间而作的器物"), title: text("Objects Shaped by Hand", "由双手塑造的器物"), body: text("Timeless ceramics, handmade in small batches. Designed to be used, admired, and kept for years.", "小批量手工陶瓷，为日常使用、欣赏与长久珍藏而作。"), ctaLabel: text("Shop Collection", "选购系列"), ctaHref: "/products", imageUrl: "/assets/hero-teaware-photo.webp", mobileImageUrl: "/assets/hero-teaware-photo.webp" } },
    { id: "artisan-story", type: "artisanStory", enabled: true, sortOrder: 30, content: { eyebrow: text("Artisan Story", "匠人故事"), title: text("Made with Purpose", "为意义而作"), body: text("Every piece begins in the hands of our artisans. We work with natural materials, time-honored techniques, and a deep respect for the process.", "每件作品都始于匠人的双手。我们尊重天然材料、传统技法与制作过程。"), secondaryBody: text("Our ceramics bring quiet beauty to everyday moments and are made to last for generations.", "让安静的美进入日常，也让器物经得起代代使用。"), ctaLabel: text("Our Story", "阅读故事"), ctaHref: "/#material-details", imageUrl: "/static/ferncliff-artisan.webp" } },
    { id: "categories", type: "categoryGrid", enabled: true, sortOrder: 40, content: { title: text("Shop by Category", "按分类选购"), categorySlugs: ["teacup", "gift", "teapot"], columnsDesktop: 3, columnsMobile: 1 } },
    { id: "limited-collection", type: "limitedCollection", enabled: true, sortOrder: 50, content: { eyebrow: text("Limited Edition", "限量作品"), title: text("Limited Edition", "限量作品"), ctaLabel: text("View all", "查看全部"), ctaHref: "/products", productSlugs: ["porcelain-tea-set", "celadon-teacup-set", "yixing-clay-pot"], columnsDesktop: 3, columnsMobile: 1 } },
    { id: "material-details", type: "materialDetails", enabled: true, sortOrder: 60, content: { eyebrow: text("Material Details", "材料细节"), title: text("The beauty is in the surface", "美，藏在器物表面"), body: text("Natural ash, mineral-rich clay, and restrained glazes make every piece subtly individual.", "天然草木灰、富含矿物的陶土与克制釉色，让每件作品保留独特肌理。"), imageUrl: "/assets/porcelain-tea-set-photo.webp" } },
    { id: "testimonials", type: "testimonials", enabled: true, sortOrder: 70, content: { title: text("Collected with care", "被认真收藏"), items: [
      { title: text("A piece with real presence", "有真实存在感的作品"), body: text("The glaze is beautifully quiet and the packaging was exceptional.", "釉色安静而耐看，包装也非常稳妥。"), author: "Sarah, London" },
      { title: text("Made to be kept", "值得长久使用"), body: text("It feels considered from every angle and has become part of our daily table.", "每个角度都经过推敲，已经成为我们日常茶席的一部分。"), author: "Mia, Melbourne" },
      { title: text("Beautifully packed", "包装稳妥而克制"), body: text("The set arrived safely overseas and looked even better in person.", "跨境运输后仍完好无损，实物比照片更有质感。"), author: "Daniel, Vancouver" },
      { title: text("Quietly distinctive", "安静但很有辨识度"), body: text("A subtle centerpiece that works equally well for tea and display.", "既适合日常茶席，也能成为空间里克制的视觉中心。"), author: "Elena, Copenhagen" }
    ] } },
    { id: "newsletter", type: "newsletter", enabled: true, sortOrder: 80, content: { eyebrow: text("Private Notes", "私享手记"), title: text("New work, quietly announced", "新品，安静地抵达"), body: text("Receive first access to limited pieces and stories from the studio.", "优先收到限量作品与工作室故事。"), ctaLabel: text("Subscribe", "订阅"), imageUrl: "/static/ferncliff-artisan.webp" } },
    { id: "footer", type: "footer", enabled: true, sortOrder: 90, content: { body: text("Handmade ceramics and sculptural objects for considered interiors.", "面向从容空间的手工陶瓷与雕塑器物。"), links: [
      { label: text("Shipping & Returns", "物流与退换"), href: "/refund-return-policy" },
      { label: text("Track Order", "查询订单"), href: "/track-order" },
      { label: text("Contact", "联系我们"), href: "/contact-us" },
      { label: text("Privacy", "隐私政策"), href: "/privacy-policy" }
    ] } }
  ];

  return { version: 1, updatedAt: new Date(0).toISOString(), publishedAt: null, modules };
}

function normalizeUrl(value: string | undefined) {
  return value ? normalizeResourceReference(value) : value;
}

function cleanText(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200d\u2060\ufeff\ufffd]/g, "").trim();
}

function cleanLocalizedText(value: HomepageLocalizedText | undefined) {
  return value ? { en: cleanText(value.en), zh: cleanText(value.zh) } : value;
}

export function normalizeHomepageLayout(layout: HomepageLayout): HomepageLayout {
  const ids = new Set<string>();
  const modules = [...layout.modules]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((module, index) => {
      if (ids.has(module.id)) throw new Error(`duplicate homepage module id: ${module.id}`);
      ids.add(module.id);
      return {
        ...module,
        sortOrder: index * 10,
        content: {
          ...module.content,
          eyebrow: cleanLocalizedText(module.content.eyebrow),
          title: cleanLocalizedText(module.content.title),
          body: cleanLocalizedText(module.content.body),
          secondaryBody: cleanLocalizedText(module.content.secondaryBody),
          ctaLabel: cleanLocalizedText(module.content.ctaLabel),
          imageUrl: normalizeUrl(module.content.imageUrl),
          mobileImageUrl: normalizeUrl(module.content.mobileImageUrl),
          links: module.content.links?.map((link) => ({ ...link, label: cleanLocalizedText(link.label)! })),
          items: module.content.items?.map((item) => ({
            ...item,
            title: cleanLocalizedText(item.title)!,
            body: cleanLocalizedText(item.body)!,
            author: item.author ? cleanText(item.author) : item.author,
            imageUrl: normalizeUrl(item.imageUrl)
          }))
        }
      };
    });

  return { ...layout, version: 1, modules };
}

export function duplicateHomepageModule(layout: HomepageLayout, moduleId: string, nextId: string): HomepageLayout {
  const sourceIndex = layout.modules.findIndex((module) => module.id === moduleId);
  if (sourceIndex < 0) throw new Error("homepage module not found");
  if (layout.modules.some((module) => module.id === nextId)) throw new Error("duplicate homepage module id");
  const modules = [...layout.modules];
  modules.splice(sourceIndex + 1, 0, { ...structuredClone(modules[sourceIndex]), id: nextId });
  return normalizeHomepageLayout({ ...layout, modules });
}

export function toggleHomepageModule(layout: HomepageLayout, moduleId: string, enabled: boolean): HomepageLayout {
  if (!layout.modules.some((module) => module.id === moduleId)) throw new Error("homepage module not found");
  return { ...layout, modules: layout.modules.map((module) => module.id === moduleId ? { ...module, enabled } : module) };
}

export function moveHomepageModule(layout: HomepageLayout, moduleId: string, beforeModuleId: string): HomepageLayout {
  const modules = [...layout.modules];
  const sourceIndex = modules.findIndex((module) => module.id === moduleId);
  if (sourceIndex < 0) throw new Error("homepage module not found");
  const [source] = modules.splice(sourceIndex, 1);
  const targetIndex = modules.findIndex((module) => module.id === beforeModuleId);
  if (targetIndex < 0) throw new Error("homepage target module not found");
  modules.splice(targetIndex, 0, source);
  return normalizeHomepageLayout({ ...layout, modules: modules.map((module, index) => ({ ...module, sortOrder: index * 10 })) });
}

export function removeHomepageModule(layout: HomepageLayout, moduleId: string): HomepageLayout {
  const module = layout.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error("homepage module not found");
  if (module.type === "header" || module.type === "footer") throw new Error("required homepage module cannot be removed");
  return normalizeHomepageLayout({ ...layout, modules: layout.modules.filter((item) => item.id !== moduleId) });
}
