import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync } from "node:fs";

const screenshotDir = "artifacts/screenshots";

const pages = [
  { name: "storefront", url: "http://localhost:3000", marker: "Teaware for modern rituals" },
  { name: "admin", url: "http://localhost:3001", marker: "运营总览" }
] as const;

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 1000 }
] as const;

test.beforeAll(() => {
  mkdirSync(screenshotDir, { recursive: true });
});

async function expectSavedOrExplicitApiFallback(statusLocator: Locator) {
  await expect(statusLocator).toHaveText(/^(已保存|API 未连接，本地已保留修改)$/);
}

for (const target of pages) {
  for (const viewport of viewports) {
    test(`${target.name} is responsive on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(target.url, { waitUntil: "networkidle" });

      if (target.name === "admin") {
        await expect(page.getByRole("heading", { name: target.marker })).toBeVisible();
      } else {
        await expect(page.getByText(target.marker).first()).toBeVisible();
      }

      const horizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });

      expect(horizontalOverflow).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `${screenshotDir}/${target.name}-${viewport.name}.png`,
        fullPage: true
      });
    });
  }
}

test("storefront support widget opens on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await page.locator("details#support summary").click();
  await expect(page.getByText("Online customer service")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create ticket" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `${screenshotDir}/storefront-mobile-support-open.png`,
    fullPage: true
  });
});

test("storefront language switch shows Chinese homepage copy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.getByText("现代茶席茶具")).toBeVisible();
  await expect(page.getByText("按分类浏览")).toBeVisible();
  await expect(page.getByText("精选商品")).toBeVisible();
});

test("storefront product cards open bilingual detail pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await expect(page.getByText("Monthly sales 86")).toBeVisible();
  await expect(page.getByText("Stock 42")).toBeVisible();
  await expect(page.getByRole("link", { name: "Porcelain Tea Set" }).getByText("$128")).toBeVisible();

  await page.getByRole("link", { name: /Porcelain Tea Set/ }).click();
  await expect(page.getByRole("heading", { name: "Porcelain Tea Set" })).toBeVisible();
  await expect(page.getByText("HS Code")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Image and text story" })).toBeVisible();
  await expect(page.getByText("Monthly sales 86")).toBeVisible();
  await expect(page.getByText("Stock 42")).toBeVisible();

  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.getByRole("heading", { name: "白瓷功夫茶具套装" })).toBeVisible();
  await expect(page.getByText("规格参数")).toBeVisible();
  await expect(page.getByRole("heading", { name: "图文介绍" })).toBeVisible();
  await expect(page.getByRole("button", { name: "加入购物车" })).toBeVisible();
  await expect(page.getByText("本月销量 86")).toBeVisible();
  await expect(page.getByText("库存 42")).toBeVisible();
});

test("storefront product list paginates and sorts by sales", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await expect(page.getByText("Showing 1-4 of 9")).toBeVisible();
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await expect(page.getByRole("link", { name: "Compact Travel Case" })).not.toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(page.getByRole("link", { name: "Compact Travel Case" })).toBeVisible();

  await page.getByLabel("Sort").selectOption("salesDesc");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await expect(page.getByRole("link", { name: "Celadon Teacup Set" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("storefront category cards open category pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  const categorySection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Search by category" }) });
  await categorySection.getByRole("link", { name: /Teapots/ }).click();
  await expect(page).toHaveURL(/\/categories\/teapot/);
  await expect(page.getByRole("heading", { name: "Teapots" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yixing Clay Pot" })).toBeVisible();
  await expect(page.getByText("Selected product")).not.toBeVisible();
  const productsSection = page.locator("section#products");
  await expect(productsSection.getByRole("searchbox")).not.toBeVisible();
  await expect(productsSection.getByRole("combobox")).not.toBeVisible();
  await expect(productsSection.getByRole("button", { name: "Best sellers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
});

test("storefront product search suggests system product names", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/#products", { waitUntil: "networkidle" });

  const productsSection = page.locator("section#products");
  await productsSection.getByRole("searchbox").fill("Porc");
  await expect(productsSection.getByRole("button", { name: /Porcelain Tea Set/ })).toBeVisible();
  await productsSection.getByRole("button", { name: /Porcelain Tea Set/ }).click();
  await expect(productsSection.getByRole("link", { name: "Porcelain Tea Set" })).toBeVisible();
});

test("storefront add to cart opens cart and checkout pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/products/porcelain-tea-set", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart, 1 items" })).toBeVisible();

  await page.getByRole("link", { name: "Cart, 1 items" }).click();
  await expect(page.getByRole("heading", { name: "Shopping cart" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Porcelain Tea Set" })).toBeVisible();
  await expect(page.getByText("Subtotal", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("Porcelain Tea Set")).toBeVisible();
  await expect(page.getByRole("button", { name: "Place mock order" })).toBeVisible();
  await page.getByLabel("Email").fill("buyer@example.com");
  await page.getByLabel("City").fill("Los Angeles");
  await page.getByLabel("Postal code").fill("90001");
  await page.getByLabel("Street address").fill("100 Tea Market Road");
  await page.getByRole("button", { name: "Place mock order" }).click();
  await expect(page.getByRole("status")).toHaveText(/^(Mock order .+ created with (postgres|memory|unknown) inventory, (postgres|memory|unknown) storage, and (provider|local-fallback|unknown) payment\.|Order API is unavailable\. Cart is kept, and no fake success was shown\.)$/);
});

test("storefront buy now opens checkout with the selected product", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/products/porcelain-tea-set", { waitUntil: "networkidle" });

  await page.getByRole("link", { name: "Buy now" }).click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("Porcelain Tea Set")).toBeVisible();
  await expect(page.getByText("Qty 1")).toBeVisible();
});

test("storefront regional cards open custom porcelain pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.getByRole("heading", { name: "地域定制瓷器", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /北京/ }).click();
  await expect(page.getByRole("heading", { name: "北京地域定制瓷器" })).toBeVisible();
  await expect(page.getByText("可以从左上角菜单切换其他地域或商品类型。")).toBeVisible();
});

test("storefront homepage regions expand and collapse in place", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await expect(page.getByRole("link", { name: /Tianjin/ })).not.toBeVisible();
  await page.getByRole("button", { name: "Expand all regions" }).click();
  await expect(page.getByRole("link", { name: /Tianjin/ })).toBeVisible();
  await page.getByRole("button", { name: "Collapse regions" }).click();
  await expect(page.getByRole("link", { name: /Tianjin/ })).not.toBeVisible();
});

test("storefront mobile menu includes region links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("complementary");
  await expect(drawer.getByText("Regions")).toBeVisible();
  await drawer.getByText("Shanghai").click();
  await expect(page.getByRole("heading", { name: "Shanghai Custom Porcelain" })).toBeVisible();
});

test("storefront all regions page lists configured vector region entries", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/regions", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "All regions" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Beijing/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Guangdong/ })).toBeVisible();
});

test("storefront desktop product list uses pagination controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await expect(page.getByText("Showing 1-4 of 9")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Showing 5-8 of 9")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeEnabled();
});

test("admin email settings can be saved on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /邮箱设置/ }).click();

  const emailSettings = page.locator("section[aria-labelledby='email-settings-title']");
  await expect(emailSettings.getByRole("heading", { name: "邮箱设置" })).toBeVisible();
  await expect(emailSettings.getByLabel("SMTP 主机")).toHaveValue("localhost");
  await emailSettings.getByLabel("Reply-To 邮箱").fill("support@demo-teaware.local");
  await emailSettings.getByRole("button", { name: "保存邮箱设置" }).click();
  await expectSavedOrExplicitApiFallback(emailSettings.getByRole("status"));

  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("admin can edit product price and listing status", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /商品管理/ }).click();

  const productPanel = page.locator("section[aria-labelledby='product-management-title']");
  await expect(productPanel.getByRole("heading", { name: "商品上下架、价格和中英文名称" })).toBeVisible();
  await expect(productPanel.getByLabel("中文详情图文").first()).toBeVisible();
  await expect(productPanel.getByLabel("详情图片上传（自动压缩）").first()).toBeVisible();
  await productPanel.getByLabel("美元价格").first().fill("108");
  await productPanel.getByRole("button", { name: "已上架" }).first().click();
  await expect(productPanel.getByRole("button", { name: "已下架" }).first()).toBeVisible();
  await productPanel.getByRole("button", { name: "保存商品修改" }).click();
  await expectSavedOrExplicitApiFallback(productPanel.getByRole("status"));
});

test("admin can maintain product categories", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /商品分类/ }).click();

  const categoryPanel = page.locator("section[aria-labelledby='category-management-title']");
  await expect(categoryPanel.getByRole("heading", { name: "商品分类、中英文名称和排序" })).toBeVisible();
  await categoryPanel.getByRole("button", { name: "新增分类" }).click();
  await expect(categoryPanel.locator("input[value='新分类']")).toBeVisible();
  await categoryPanel.getByRole("button", { name: "保存分类配置" }).click();
  await expectSavedOrExplicitApiFallback(categoryPanel.getByRole("status"));
});

test("admin can maintain regional city categories", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /地域分类/ }).click();

  const regionPanel = page.locator("section[aria-labelledby='region-management-title']");
  await expect(regionPanel.getByRole("heading", { name: "省份城市分类、矢量样式和首页展示" })).toBeVisible();
  await regionPanel.getByRole("button", { name: "新增省份" }).click();
  await expect(regionPanel.locator("input[value='新省份']")).toBeVisible();
  await regionPanel.getByLabel("矢量样式").last().selectOption("mountain");
  await regionPanel.getByRole("button", { name: "保存地域配置" }).click();
  await expectSavedOrExplicitApiFallback(regionPanel.getByRole("status"));
});

test("admin can sort discounts and edit discount amount", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /折扣管理/ }).click();

  const discountPanel = page.locator("section[aria-labelledby='discount-management-title']");
  await expect(discountPanel.getByRole("heading", { name: "折扣金额、排序和中英文内容" })).toBeVisible();
  await discountPanel.getByLabel("折扣排序").selectOption("valueDesc");
  await expect(discountPanel.getByText("礼品套装立减")).toBeVisible();
  await discountPanel.getByLabel("折扣金额或比例").first().fill("25");
  await discountPanel.getByRole("button", { name: "保存折扣" }).click();
  await expect(discountPanel.getByRole("status")).toHaveText("已保存");
});

test("admin can save foreign trade settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /外贸站设置/ }).click();

  const tradePanel = page.locator("section[aria-labelledby='trade-settings-title']");
  await expect(tradePanel.getByRole("heading", { name: "外贸站设置" })).toBeVisible();
  await tradePanel.getByLabel("默认币种").fill("EUR");
  await tradePanel.getByLabel("税费模式").selectOption("manual");
  await tradePanel.getByRole("button", { name: "保存外贸设置" }).click();
  await expect(tradePanel.getByRole("status")).toHaveText("已保存");
});

test("admin order management reads orders or shows explicit API fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /订单管理/ }).click();

  const orderPanel = page.locator("section[aria-labelledby='orders-title']");
  await expect(orderPanel.getByRole("heading", { name: "订单管理" })).toBeVisible();
  await expect(orderPanel.getByRole("button", { name: /刷新订单|刷新中/ })).toBeVisible();
  await expect(orderPanel.getByRole("status")).toHaveText(/^(订单数 \d+，当前合计 .+，内存模式 \d+|)$/);
  await expect(orderPanel.getByRole("heading", { name: "订单详情与支付操作" })).toBeVisible();
  await expect(orderPanel).toContainText(/(订单操作审计|从上方订单列表选择一笔订单后查看详情和 Mock 支付操作)/);
  await expect(orderPanel).toContainText(/(暂无订单|订单服务或管理网关未连接|订单状态|API 未连接)/);
});

test("admin inventory management reads inventory or shows explicit API fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /库存管理/ }).click();

  const inventoryPanel = page.locator("section[aria-labelledby='inventory-title']");
  await expect(inventoryPanel.getByRole("heading", { name: "库存管理" })).toBeVisible();
  await expect(inventoryPanel.getByRole("button", { name: /刷新库存|刷新中/ })).toBeVisible();
  await expect(inventoryPanel.getByRole("status")).toHaveText(
    /^SKU \d+，可用 \d+，预留 \d+，锁定 \d+，可售 -?\d+，低库存 \d+，内存模式 \d+$/
  );
  await expect(inventoryPanel.getByRole("heading", { name: "库存预留流水" })).toBeVisible();
  await expect(inventoryPanel.getByRole("heading", { name: "库存操作审计" })).toBeVisible();
  await expect(inventoryPanel).toContainText(/(暂无库存|库存服务或管理网关未连接|可用库存|API 未连接)/);
});

test("admin dead letter queue exposes audit trail area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "菜单" }).click();
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: /死信队列/ }).click();

  const dlqPanel = page.locator("section[aria-labelledby='dead-letter-title']");
  await expect(dlqPanel.getByRole("heading", { name: "死信队列" })).toBeVisible();
  await expect(dlqPanel.getByRole("button", { name: /刷新死信|刷新中/ })).toBeVisible();
  await expect(dlqPanel.getByRole("status")).toHaveText(/^死信数 \d+，待处理 \d+，重试中 \d+$/);
  await expect(dlqPanel).toContainText(/(审计记录|暂无死信任务|worker-service 或管理网关未连接|DLQ API 未连接)/);
});

test("admin desktop sidebar switches management sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  const sidebar = page.getByRole("navigation", { name: "Admin sections" });
  await sidebar.getByRole("button", { name: /商品管理/ }).click();
  await expect(page.getByRole("heading", { name: "商品上下架、价格和中英文名称" })).toBeVisible();
  await sidebar.getByRole("button", { name: /折扣管理/ }).click();
  await expect(page.getByRole("heading", { name: "折扣金额、排序和中英文内容" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("storefront cart button is visible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await expect(page.getByRole("link", { name: "Cart, 0 items" })).toBeVisible();
});

test("storefront hero can be manually collapsed on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await expect(page.getByText("Teaware for modern rituals")).toBeVisible();
  await page.getByRole("button", { name: "Collapse hero" }).click();
  await expect(page.getByText("Teaware for modern rituals")).not.toBeVisible();
  await expect(page.getByText("Search by category")).toBeVisible();
  await page.getByRole("button", { name: "Expand hero" }).click();
  await expect(page.getByText("Teaware for modern rituals")).toBeVisible();

  await page.screenshot({
    path: `${screenshotDir}/storefront-mobile-hero-collapsed-toggle.png`,
    fullPage: true
  });
});

test("storefront registration form opens from mobile menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.screenshot({
    path: `${screenshotDir}/storefront-mobile-registration-open.png`,
    fullPage: true
  });
});

test("storefront account page exposes login, reset, and profile sections", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/account", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Account home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Forgot password?" })).toBeVisible();
  await expect(page.getByLabel("Account email")).toBeVisible();
});

test("storefront header shows signed-in customer name", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    window.localStorage.setItem("demo-teaware-customer", JSON.stringify({
      customerId: "cust-test",
      email: "alice@example.com",
      username: "Alice"
    }));
  });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await expect(page.getByText("Alice")).toBeVisible();
});

test("storefront reset password page accepts reset links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/reset-password?token=test-token", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await expect(page.getByLabel("New password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit new password" })).toBeEnabled();
});

test("storefront mobile menu opens as a drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByText("Shop menu")).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("searchbox", { name: "Search products" })).toBeVisible();
  await expect(page.getByText("Categories")).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Teapots")).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Accessories")).not.toBeVisible();
  await page.getByRole("button", { name: "Expand categories" }).click();
  await expect(page.getByRole("complementary").getByText("Accessories")).toBeVisible();
  await page.getByRole("button", { name: "Collapse categories" }).click();
  await expect(page.getByRole("complementary").getByText("Accessories")).not.toBeVisible();
  await expect(page.getByRole("complementary").getByText("Tianjin")).not.toBeVisible();
  await page.getByRole("button", { name: "Expand regions" }).click();
  await expect(page.getByRole("complementary").getByText("Tianjin")).toBeVisible();
  await page.getByRole("button", { name: "Collapse regions" }).click();
  await expect(page.getByRole("complementary").getByText("Tianjin")).not.toBeVisible();

  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `${screenshotDir}/storefront-mobile-menu-open.png`,
    fullPage: true
  });
});

test("product detail mobile menu fills the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/products/porcelain-tea-set", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("complementary");
  await expect(drawer.getByText("Shop menu")).toBeVisible();

  const drawerBox = await drawer.boundingBox();
  expect(drawerBox?.height ?? 0).toBeGreaterThanOrEqual(840);

  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("storefront legal pages use the shared premium shell", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const legalPages = [
    { url: "/privacy-policy", heading: "Privacy Policy", marker: "Payments" },
    { url: "/refund-return-policy", heading: "Refund and Return Policy", marker: "30-Day Return Window" },
    { url: "/terms-of-service", heading: "Terms of Service", marker: "Orders and Payment" },
    { url: "/contact-us", heading: "Contact Us", marker: "Business Hours" }
  ];

  for (const legalPage of legalPages) {
    await page.goto(`http://localhost:3000${legalPage.url}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: legalPage.heading })).toBeVisible();
    await expect(page.getByRole("heading", { name: legalPage.marker })).toBeVisible();
    const legalNav = page.locator("main > section nav");
    await expect(legalNav.getByRole("link", { name: "Privacy Policy", exact: true })).toBeVisible();
    await expect(legalNav.getByRole("link", { name: "Refund and Return Policy", exact: true })).toBeVisible();
    await expect(legalNav.getByRole("link", { name: "Terms of Service", exact: true })).toBeVisible();
    await expect(legalNav.getByRole("link", { name: "Contact Us", exact: true })).toBeVisible();

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  }
});

test("storefront payment result page covers success and language switch", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/payment-result?status=success&order=TEST-1001", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await expect(page.getByText("Order TEST-1001")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue shopping" })).toBeVisible();
  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.getByRole("heading", { name: "付款成功" })).toBeVisible();
  await expect(page.getByRole("link", { name: "进入个人中心" })).toBeVisible();
});

test("storefront tracking page is self-hosted and does not fake provider success", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/track-order", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Track your parcel" })).toBeVisible();
  await page.getByLabel("Tracking number").fill("YT202606150001");
  await page.getByRole("button", { name: "Track" }).click();
  await expect(page.getByRole("status")).toHaveText(/(Local mock tracking|Tracking is temporarily unavailable|fetch failed|Failed to fetch|HTTP \d+)/);
});

test("storefront product reviews section exposes moderated review flow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/products/porcelain-tea-set?orderId=ORDER-1001&email=buyer@example.com", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Customer reviews" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Write a review" })).toBeVisible();
  await expect(page.getByLabel("Order ID")).toHaveValue("ORDER-1001");
  await expect(page.getByLabel("Email")).toHaveValue("buyer@example.com");
  await expect(page.getByRole("button", { name: "Submit review" })).toBeVisible();
});

test("admin restored logistics, review, ops, product import, email template, and audit panels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  async function openAdminSection(label: RegExp) {
    await page.getByRole("button", { name: "菜单" }).click();
    await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: label }).click();
  }

  await openAdminSection(/物流管理/);
  await expect(page.getByRole("heading", { name: "物流轨迹查询" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "物流 API 账号池" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "物流 API 调用日志" })).toBeVisible();

  await openAdminSection(/评论管理/);
  await expect(page.getByRole("heading", { name: "商品评论" })).toBeVisible();
  await expect(page.getByText("新评论默认待审核")).toBeVisible();

  await openAdminSection(/运维配置/);
  await expect(page.getByRole("heading", { name: "SSL / CDN / 统计配置" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "HTTPS 证书" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cloudflare 免费 CDN" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GA4 + GSC 免费统计" })).toBeVisible();

  await openAdminSection(/商品导入/);
  await expect(page.getByRole("heading", { name: "商品批量导入与 AI 工作流" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "文案与图片生成配置" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "链接批量导入" })).toBeVisible();

  await openAdminSection(/邮箱设置/);
  await expect(page.locator("section[aria-labelledby='email-settings-title']").getByRole("heading", { name: "邮箱设置" })).toBeVisible();
  await expect(page.locator("section[aria-labelledby='transactional-email-templates-title']").getByRole("heading", { name: "事务邮件模板" })).toBeVisible();
  await expect(page.locator("body")).toContainText(/(注册|付款成功|物流|评价|暂无模板|HTTP|API 未连接)/);

  await openAdminSection(/审计日志/);
  await expect(page.locator("section[aria-labelledby='audit-log']").getByRole("heading", { name: "审计日志" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新审计" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
