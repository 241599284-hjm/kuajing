"use client";

import { BarChart3, Boxes, CreditCard, FileClock, Globe2, Mail, MapPinned, Menu, Package, Percent, Settings, ShieldCheck, ShoppingCart, Tags, Truck, X } from "lucide-react";
import { useState } from "react";
import { CategoryManagementPanel } from "./category-management-panel.js";
import { DeadLetterManagementPanel } from "./dead-letter-management-panel.js";
import { DiscountManagementPanel } from "./discount-management-panel.js";
import { EmailSettingsPanel } from "./email-settings-panel.js";
import { InventoryManagementPanel } from "./inventory-management-panel.js";
import { LogisticsManagementPanel } from "./logistics-management-panel.js";
import { OrderManagementPanel } from "./order-management-panel.js";
import { ProductManagementPanel } from "./product-management-panel.js";
import { RegionManagementPanel } from "./region-management-panel.js";
import { TradeSettingsPanel } from "./trade-settings-panel.js";

type AdminSection =
  | "dashboard"
  | "categories"
  | "regions"
  | "products"
  | "inventory"
  | "orders"
  | "discounts"
  | "payments"
  | "logistics"
  | "trade"
  | "email"
  | "support"
  | "dlq"
  | "audit";

const navigationGroups: Array<{
  title: string;
  items: Array<{ id: AdminSection; label: string; description: string; icon: typeof BarChart3 }>;
}> = [
  {
    title: "运营",
    items: [
      { id: "dashboard", label: "运营总览", description: "店铺概览", icon: BarChart3 },
      { id: "categories", label: "商品分类", description: "分类、中英文名称、排序", icon: Tags },
      { id: "regions", label: "地域分类", description: "省份城市、矢量样式", icon: MapPinned },
      { id: "products", label: "商品管理", description: "上下架、价格、中英文名称", icon: Package },
      { id: "inventory", label: "库存管理", description: "库存与仓库", icon: Boxes },
      { id: "orders", label: "订单管理", description: "订单流转", icon: ShoppingCart }
    ]
  },
  {
    title: "增长",
    items: [
      { id: "discounts", label: "折扣管理", description: "折扣码、金额、排序", icon: Percent },
      { id: "support", label: "客服售后", description: "工单与售后", icon: ShieldCheck }
    ]
  },
  {
    title: "跨境",
    items: [
      { id: "trade", label: "外贸站设置", description: "币种、税费、HS Code", icon: Globe2 },
      { id: "payments", label: "支付管理", description: "通道优先级", icon: CreditCard },
      { id: "logistics", label: "物流管理", description: "轨迹、账号、额度", icon: Truck },
      { id: "email", label: "邮箱设置", description: "SMTP 与注册邮件", icon: Mail }
    ]
  },
  {
    title: "系统",
    items: [
      { id: "dlq", label: "死信队列", description: "失败异步任务", icon: FileClock },
      { id: "audit", label: "审计日志", description: "操作记录", icon: Settings }
    ]
  }
];

const sectionMeta: Record<AdminSection, { title: string; eyebrow: string; body: string }> = {
  dashboard: {
    title: "运营总览",
    eyebrow: "demo-teaware",
    body: "本地后台工作台，用于管理商品、库存、订单、支付记录、死信队列和审计日志。"
  },
  products: {
    title: "商品管理",
    eyebrow: "商品运营",
    body: "管理商品上架/下架、中英文名称、价格、分类和地域定制定位。"
  },
  categories: {
    title: "商品分类",
    eyebrow: "基础资料",
    body: "先维护商品分类，再在商品管理中选择分类，供前台筛选、导航和详情页使用。"
  },
  regions: {
    title: "地域分类",
    eyebrow: "基础资料",
    body: "先维护省份城市、中英文名称、地标、矢量图标样式、排序和首页展示，再绑定到商品。"
  },
  inventory: {
    title: "库存管理",
    eyebrow: "库存运营",
    body: "仓库库存、库存预留、安全库存和入库记录后续会在这里管理。"
  },
  orders: {
    title: "订单管理",
    eyebrow: "履约运营",
    body: "订单审核、支付状态、发货状态和售后流转后续会在这里管理。"
  },
  discounts: {
    title: "折扣管理",
    eyebrow: "促销运营",
    body: "管理折扣码、固定金额折扣、百分比折扣、启停状态和展示排序。"
  },
  payments: {
    title: "支付管理",
    eyebrow: "支付通道",
    body: "支付记录、通道健康、退款和 Webhook 状态后续会在这里管理。"
  },
  logistics: {
    title: "物流管理",
    eyebrow: "物流轨迹",
    body: "维护物流 Provider 账号池、额度、轨迹缓存、调用日志和物流更新邮件。"
  },
  trade: {
    title: "外贸站设置",
    eyebrow: "跨境独立站",
    body: "配置币种、税费模式、HS Code 要求、物流市场和支付通道优先级。"
  },
  email: {
    title: "邮箱设置",
    eyebrow: "店铺邮件",
    body: "配置注册邮件和 SMTP 发送设置。"
  },
  support: {
    title: "客服售后",
    eyebrow: "客户运营",
    body: "工单、在线客服、退款沟通和售后凭证后续会在这里管理。"
  },
  dlq: {
    title: "死信队列",
    eyebrow: "异步任务",
    body: "支付回调失败、物流同步失败和人工重试队列后续会在这里管理。"
  },
  audit: {
    title: "审计日志",
    eyebrow: "安全运营",
    body: "管理员操作、配置变更和敏感操作记录后续会在这里管理。"
  }
};

const dashboardCards = [
  { title: "商品管理", section: "products" },
  { title: "商品分类", section: "categories" },
  { title: "地域分类", section: "regions" },
  { title: "库存管理", section: "inventory" },
  { title: "订单管理", section: "orders" },
  { title: "支付管理", section: "payments" },
  { title: "邮箱设置", section: "email" },
  { title: "客服售后", section: "support" },
  { title: "死信队列", section: "dlq" },
  { title: "审计日志", section: "audit" }
];

function PlaceholderPanel({ section }: { section: AdminSection }) {
  const meta = sectionMeta[section];

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-6">
      <p className="text-sm text-[var(--ink-soft)]">{meta.eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold">{meta.title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">{meta.body}</p>
      <div className="mt-5 rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
        模块占位。后续接入 API 后，这里会变成可操作的管理页面。
      </div>
    </section>
  );
}

function DashboardPanel({ onNavigate }: { onNavigate: (section: AdminSection) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {dashboardCards.map((card) => {
        return (
          <button
            key={card.title}
            className="rounded-lg border border-[var(--line)] bg-white p-6 text-left"
            onClick={() => onNavigate(card.section as AdminSection)}
            type="button"
          >
            <h3 className="text-xl font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">进入对应管理工作区。</p>
          </button>
        );
      })}
    </div>
  );
}

function AdminSidebar({
  activeSection,
  onNavigate
}: {
  activeSection: AdminSection;
  onNavigate: (section: AdminSection) => void;
}) {
  return (
    <nav className="grid gap-6" aria-label="Admin sections">
      {navigationGroups.map((group) => (
        <div key={group.title}>
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{group.title}</p>
          <div className="mt-2 grid gap-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeSection;

              return (
                <button
                  key={item.id}
                  className={[
                    "flex w-full items-start gap-3 rounded-md px-3 py-3 text-left",
                    isActive ? "bg-black text-white" : "text-[var(--ink)] hover:bg-white"
                  ].join(" ")}
                  onClick={() => onNavigate(item.id)}
                  type="button"
                >
                  <Icon className="mt-0.5 shrink-0" size={18} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={["mt-0.5 block text-xs leading-5", isActive ? "text-white/70" : "text-[var(--ink-soft)]"].join(" ")}>
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AdminContent({ activeSection, onNavigate }: { activeSection: AdminSection; onNavigate: (section: AdminSection) => void }) {
  if (activeSection === "dashboard") return <DashboardPanel onNavigate={onNavigate} />;
  if (activeSection === "categories") return <CategoryManagementPanel />;
  if (activeSection === "regions") return <RegionManagementPanel />;
  if (activeSection === "products") return <ProductManagementPanel />;
  if (activeSection === "inventory") return <InventoryManagementPanel />;
  if (activeSection === "orders") return <OrderManagementPanel />;
  if (activeSection === "discounts") return <DiscountManagementPanel />;
  if (activeSection === "trade") return <TradeSettingsPanel />;
  if (activeSection === "logistics") return <LogisticsManagementPanel />;
  if (activeSection === "email") return <EmailSettingsPanel />;
  if (activeSection === "dlq") return <DeadLetterManagementPanel />;
  return <PlaceholderPanel section={activeSection} />;
}

export function AdminWorkspace() {
  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const meta = sectionMeta[activeSection];

  function navigate(section: AdminSection) {
    setActiveSection(section);
    setIsMobileMenuOpen(false);
  }

  return (
    <main className="min-h-screen overflow-x-hidden">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--line)] bg-[var(--bg)] px-4 py-6 lg:block">
          <div className="mb-8 px-3">
            <p className="text-sm text-[var(--ink-soft)]">demo-teaware</p>
            <h1 className="text-2xl font-semibold">商家后台</h1>
          </div>
          <AdminSidebar activeSection={activeSection} onNavigate={navigate} />
        </aside>

        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close admin menu backdrop"
              className="absolute inset-0 bg-black/45"
              onClick={() => setIsMobileMenuOpen(false)}
              type="button"
            />
            <aside className="relative h-full max-h-screen w-[min(22rem,90vw)] overflow-y-auto bg-[var(--bg)] px-4 py-5 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4 px-3">
                <div>
                  <p className="text-sm text-[var(--ink-soft)]">demo-teaware</p>
                  <h1 className="text-2xl font-semibold">商家后台</h1>
                </div>
                <button
                  aria-label="Close admin menu"
                  className="flex size-10 items-center justify-center rounded-full border border-[var(--line)] bg-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                  type="button"
                >
                  <X size={20} />
                </button>
              </div>
              <AdminSidebar activeSection={activeSection} onNavigate={navigate} />
            </aside>
          </div>
        ) : null}

        <div className="min-w-0">
          <header className="border-b border-[var(--line)] bg-white px-4 py-5 sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-[var(--ink-soft)]">{meta.eyebrow}</p>
                <h2 className="text-2xl font-semibold">{meta.title}</h2>
              </div>
              <button
                className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-black px-4 text-sm font-semibold text-white lg:hidden"
                onClick={() => setIsMobileMenuOpen(true)}
                type="button"
              >
                <Menu size={17} />
                菜单
              </button>
              <button className="hidden rounded-full bg-black px-5 py-2 text-sm text-white lg:block">管理员</button>
            </div>
          </header>

          <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
            <p className="mb-6 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{meta.body}</p>
            <AdminContent activeSection={activeSection} onNavigate={navigate} />
          </section>
        </div>
      </div>
    </main>
  );
}
