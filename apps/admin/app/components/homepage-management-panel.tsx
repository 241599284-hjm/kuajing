"use client";

import {
  createDefaultHomepageLayout,
  duplicateHomepageModule,
  moveHomepageModule,
  removeHomepageModule,
  toggleHomepageModule,
  type HomepageLayout,
  type HomepageLocalizedText,
  type HomepageModule
} from "@commerce/contracts";
import { Copy, Eye, GripVertical, Monitor, Save, Send, Smartphone, Trash2, UploadCloud, Wifi } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRequestId } from "../lib/request-id.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { ConfirmDialog } from "./ui/dialog.js";
import { Input } from "./ui/input.js";
import { NewsletterSubscriberPanel } from "./newsletter-subscriber-panel.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";
const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000";

const labels: Record<HomepageModule["type"], string> = {
  announcement: "顶部通知条",
  header: "品牌导航",
  hero: "首屏主视觉",
  artisanStory: "匠人故事",
  categoryGrid: "分类导航",
  limitedCollection: "限量藏品",
  materialDetails: "材质细节",
  testimonials: "买家评价",
  newsletter: "邮件订阅",
  footer: "底部信息栏"
};

type PendingAction = { kind: "publish" } | { kind: "delete"; moduleId: string } | null;

function localized(value: HomepageLocalizedText | undefined, locale: "en" | "zh") {
  return value?.[locale] ?? "";
}

export function HomepageManagementPanel() {
  const [layout, setLayout] = useState<HomepageLayout>(() => createDefaultHomepageLayout());
  const [selectedId, setSelectedId] = useState("hero");
  const [status, setStatus] = useState("正在读取首页配置");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const selected = useMemo(() => layout.modules.find((module) => module.id === selectedId) ?? layout.modules[0], [layout, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${adminGatewayUrl}/storefront/homepage`, { signal: controller.signal, headers: { "x-correlation-id": createRequestId() } })
      .then(async (response) => {
        if (!response.ok) throw new Error("首页配置接口返回错误");
        const payload = await response.json() as HomepageLayout;
        setLayout(payload);
        setSelectedId(payload.modules.find((module) => module.type === "hero")?.id ?? payload.modules[0]?.id ?? "hero");
        setStatus(payload.publishedAt ? `已发布于 ${new Date(payload.publishedAt).toLocaleString()}` : "草稿已加载");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("首页接口暂不可用，当前显示内置完整配置");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!previewReady || !frame?.contentWindow) return;
    const timer = window.setTimeout(() => frame.contentWindow?.postMessage({ type: "homepage-preview", layout }, storefrontUrl), 80);
    return () => window.clearTimeout(timer);
  }, [layout, previewMode, previewReady]);

  function updateSelected(patch: Partial<HomepageModule["content"]>) {
    setLayout((current) => ({
      ...current,
      modules: current.modules.map((module) => module.id === selected.id
        ? { ...module, content: { ...module.content, ...patch } }
        : module)
    }));
    setStatus("有未保存修改");
  }

  function updateLocalized(field: "eyebrow" | "title" | "body" | "secondaryBody" | "ctaLabel", locale: "en" | "zh", value: string) {
    updateSelected({ [field]: { en: localized(selected.content[field], "en"), zh: localized(selected.content[field], "zh"), [locale]: value } });
  }

  async function save(publish: boolean) {
    setBusy(true);
    setStatus(publish ? "正在发布" : "正在保存草稿");
    try {
      const response = await fetch(`${adminGatewayUrl}/storefront/homepage`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-correlation-id": createRequestId() },
        body: JSON.stringify({ layout, publish })
      });
      const payload = await response.json().catch(() => ({})) as HomepageLayout & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "保存失败");
      setLayout(payload);
      setStatus(publish ? "首页已发布" : "草稿已保存");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setStatus("正在检测 store-service 与数据库");
    try {
      const response = await fetch(`${adminGatewayUrl}/storefront/homepage/ready`, { headers: { "x-correlation-id": createRequestId() } });
      if (!response.ok) throw new Error();
      setStatus("首页配置接口、store-service 与数据库连接正常");
    } catch {
      setStatus("连通性检测失败，请检查 admin-gateway、store-service 与 PostgreSQL");
    }
  }

  async function uploadImage(file: File) {
    setStatus("正在上传并处理图片");
    const formData = new FormData();
    formData.append("file", file, file.name);
    try {
      const response = await fetch(`${adminGatewayUrl}/media/product-assets`, {
        method: "POST",
        headers: { "x-correlation-id": createRequestId() },
        body: formData
      });
      const payload = await response.json().catch(() => ({})) as { url?: string; message?: string };
      if (!response.ok || !payload.url) throw new Error(payload.message ?? "上传失败");
      updateSelected({ imageUrl: payload.url });
      setStatus("图片已上传，发布后生效");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "图片上传失败");
    }
  }

  function duplicate(moduleId: string) {
    const nextId = `${moduleId}-copy-${Date.now().toString(36)}`;
    setLayout((current) => duplicateHomepageModule(current, moduleId, nextId));
    setSelectedId(nextId);
    setStatus("模块已复制，待保存");
  }

  function confirmPendingAction() {
    if (pendingAction?.kind === "publish") void save(true);
    if (pendingAction?.kind === "delete") {
      setLayout((current) => removeHomepageModule(current, pendingAction.moduleId));
      setSelectedId("hero");
      setStatus("模块已删除，待保存");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h1 className="text-xl font-semibold">首页可视化编辑</h1><p className="mt-1 text-xs text-[var(--muted-foreground)]">模块排序、内容、图片与双端预览统一保存到 store-service。{subscriberCount === null ? "" : ` 邮件订阅 ${subscriberCount} 人。`}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void testConnection()}><Wifi size={15}/>测试连通性</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(false)}><Save size={15}/>保存草稿</Button>
          <Button size="sm" disabled={busy} onClick={() => setPendingAction({ kind: "publish" })}><Send size={15}/>发布首页</Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[19rem_minmax(22rem,0.8fr)_minmax(30rem,1.3fr)]">
        <Card className="min-w-0 self-start"><CardHeader><CardTitle>页面模块</CardTitle><Badge tone="info">{layout.modules.length} 个</Badge></CardHeader><CardContent className="space-y-2">
          {layout.modules.map((module) => (
            <div
              key={module.id}
              draggable
              onDragStart={() => setDraggedId(module.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (draggedId && draggedId !== module.id) setLayout((current) => moveHomepageModule(current, draggedId, module.id)); setDraggedId(null); }}
              className={`flex items-center gap-2 rounded-lg border p-2 ${selected.id === module.id ? "border-[#1e7a5d] bg-[#eef8f4]" : "border-[var(--border)] bg-white"}`}
            >
              <button className="cursor-grab text-[var(--muted-foreground)]" type="button" aria-label="拖动排序"><GripVertical size={16}/></button>
              <button className="min-w-0 flex-1 text-left" type="button" onClick={() => setSelectedId(module.id)}><strong className="block truncate text-sm font-medium">{labels[module.type]}</strong><span className="block truncate text-xs text-[var(--muted-foreground)]">{module.id}</span></button>
              <input aria-label={`${labels[module.type]}显示状态`} checked={module.enabled} onChange={(event) => setLayout((current) => toggleHomepageModule(current, module.id, event.target.checked))} type="checkbox" />
              <Button size="icon" variant="ghost" title="复制模块" onClick={() => duplicate(module.id)}><Copy size={15}/></Button>
              <Button size="icon" variant="ghost" disabled={module.type === "header" || module.type === "footer"} title="删除模块" onClick={() => setPendingAction({ kind: "delete", moduleId: module.id })}><Trash2 size={15}/></Button>
            </div>
          ))}
        </CardContent></Card>

        <Card className="min-w-0 self-start"><CardHeader><div><CardTitle>{labels[selected.type]}</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">英文与中文内容同步维护</p></div><Badge tone={selected.enabled ? "success" : "neutral"}>{selected.enabled ? "已显示" : "已隐藏"}</Badge></CardHeader><CardContent className="space-y-5">
          {(["eyebrow", "title", "body", "secondaryBody", "ctaLabel"] as const).map((field) => (
            <div key={field} className="space-y-2"><label className="text-sm font-medium">{{ eyebrow: "眉题", title: "标题", body: "正文", secondaryBody: "补充正文", ctaLabel: "按钮文字" }[field]}</label><div className="grid gap-2 sm:grid-cols-2"><Input value={localized(selected.content[field], "en")} placeholder="English" onChange={(event) => updateLocalized(field, "en", event.target.value)}/><Input value={localized(selected.content[field], "zh")} placeholder="中文" onChange={(event) => updateLocalized(field, "zh", event.target.value)}/></div></div>
          ))}
          <div className="space-y-2"><label className="text-sm font-medium">按钮链接</label><Input value={selected.content.ctaHref ?? ""} placeholder="/products" onChange={(event) => updateSelected({ ctaHref: event.target.value })}/></div>
          <div className="space-y-2"><label className="text-sm font-medium">图片相对路径</label><Input value={selected.content.imageUrl ?? ""} placeholder="/media/public/... 或 /assets/..." onChange={(event) => updateSelected({ imageUrl: event.target.value })}/><label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)] hover:border-[#1e7a5d] hover:text-[#1e7a5d]"><UploadCloud size={16}/>上传到媒体服务<input className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }}/></label></div>
          {selected.type === "hero" ? <div className="space-y-2"><label className="text-sm font-medium">手机端图片路径</label><Input value={selected.content.mobileImageUrl ?? ""} placeholder="/media/public/..." onChange={(event) => updateSelected({ mobileImageUrl: event.target.value })}/></div> : null}
          {selected.type === "categoryGrid" ? <div className="space-y-2"><label className="text-sm font-medium">分类 slug（逗号分隔）</label><Input value={(selected.content.categorySlugs ?? []).join(", ")} onChange={(event) => updateSelected({ categorySlugs: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}/></div> : null}
          {selected.type === "limitedCollection" ? <div className="space-y-2"><label className="text-sm font-medium">商品 slug（逗号分隔）</label><Input value={(selected.content.productSlugs ?? []).join(", ")} onChange={(event) => updateSelected({ productSlugs: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}/></div> : null}
          {selected.content.links ? <div className="space-y-3"><div className="flex items-center justify-between"><label className="text-sm font-medium">导航链接</label><Button size="sm" variant="outline" onClick={() => updateSelected({ links: [...(selected.content.links ?? []), { label: { en: "New link", zh: "新链接" }, href: "/" }] })}>新增链接</Button></div>{selected.content.links.map((link, index) => <div className="grid gap-2 rounded-lg border border-[var(--border)] p-3" key={`${link.href}-${index}`}><div className="grid gap-2 sm:grid-cols-2"><Input value={link.label.en} placeholder="English" onChange={(event) => updateSelected({ links: selected.content.links?.map((item, itemIndex) => itemIndex === index ? { ...item, label: { ...item.label, en: event.target.value } } : item) })}/><Input value={link.label.zh} placeholder="中文" onChange={(event) => updateSelected({ links: selected.content.links?.map((item, itemIndex) => itemIndex === index ? { ...item, label: { ...item.label, zh: event.target.value } } : item) })}/></div><div className="flex gap-2"><Input value={link.href} placeholder="/path" onChange={(event) => updateSelected({ links: selected.content.links?.map((item, itemIndex) => itemIndex === index ? { ...item, href: event.target.value } : item) })}/><Button size="icon" variant="ghost" aria-label="删除链接" onClick={() => updateSelected({ links: selected.content.links?.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15}/></Button></div></div>)}</div> : null}
          {selected.content.items ? <div className="space-y-3"><div className="flex items-center justify-between"><label className="text-sm font-medium">内容条目</label><Button size="sm" variant="outline" onClick={() => updateSelected({ items: [...(selected.content.items ?? []), { title: { en: "New item", zh: "新条目" }, body: { en: "", zh: "" }, author: "" }] })}>新增条目</Button></div>{selected.content.items.map((item, index) => <div className="grid gap-2 rounded-lg border border-[var(--border)] p-3" key={`${item.author}-${index}`}><div className="grid gap-2 sm:grid-cols-2"><Input value={item.title.en} placeholder="English title" onChange={(event) => updateSelected({ items: selected.content.items?.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: { ...entry.title, en: event.target.value } } : entry) })}/><Input value={item.title.zh} placeholder="中文标题" onChange={(event) => updateSelected({ items: selected.content.items?.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: { ...entry.title, zh: event.target.value } } : entry) })}/></div><div className="grid gap-2 sm:grid-cols-2"><Input value={item.body.en} placeholder="English body" onChange={(event) => updateSelected({ items: selected.content.items?.map((entry, itemIndex) => itemIndex === index ? { ...entry, body: { ...entry.body, en: event.target.value } } : entry) })}/><Input value={item.body.zh} placeholder="中文正文" onChange={(event) => updateSelected({ items: selected.content.items?.map((entry, itemIndex) => itemIndex === index ? { ...entry, body: { ...entry.body, zh: event.target.value } } : entry) })}/></div><div className="flex gap-2"><Input value={item.author ?? ""} placeholder="署名" onChange={(event) => updateSelected({ items: selected.content.items?.map((entry, itemIndex) => itemIndex === index ? { ...entry, author: event.target.value } : entry) })}/><Button size="icon" variant="ghost" aria-label="删除条目" onClick={() => updateSelected({ items: selected.content.items?.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15}/></Button></div></div>)}</div> : null}
          <p className="rounded-lg bg-[var(--muted)] px-3 py-2 text-xs leading-5 text-[var(--muted-foreground)]">资源地址只保存相对路径或 HTTPS 地址；HTTP 地址会被服务端拒绝。</p>
        </CardContent></Card>

        <Card className="min-w-0 overflow-hidden"><CardHeader className="flex-col sm:flex-row"><div><CardTitle>实时预览</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">未保存修改通过安全消息同步到预览窗口</p></div><div className="flex self-start rounded-lg border border-[var(--border)] p-0.5"><Button size="sm" variant={previewMode === "desktop" ? "default" : "ghost"} onClick={() => setPreviewMode("desktop")}><Monitor size={15}/>PC</Button><Button size="sm" variant={previewMode === "mobile" ? "default" : "ghost"} onClick={() => setPreviewMode("mobile")}><Smartphone size={15}/>手机</Button></div></CardHeader><CardContent className="overflow-auto bg-[#d9ddd8] p-4"><div className={`mx-auto overflow-hidden bg-white shadow-xl transition-[width] ${previewMode === "mobile" ? "w-[375px] max-w-full" : "w-full"}`}><iframe ref={iframeRef} className="block h-[720px] w-full border-0" title="首页实时预览" src={`${storefrontUrl}/?homepagePreview=1`} onLoad={() => setPreviewReady(true)}/></div></CardContent></Card>
      </div>

      <NewsletterSubscriberPanel onCountChange={setSubscriberCount}/>

      <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><Eye size={14}/><span>{status}</span></div>
      <ConfirmDialog open={pendingAction !== null} onOpenChange={(open) => { if (!open) setPendingAction(null); }} title={pendingAction?.kind === "publish" ? "确认发布首页" : "确认删除模块"} description={pendingAction?.kind === "publish" ? "发布后将立即替换买家可见首页。请确认桌面端和手机端预览均已检查。" : "删除会从当前首页布局移除此模块，保存或发布后生效。"} confirmLabel={pendingAction?.kind === "publish" ? "确认发布" : "确认删除"} danger={pendingAction?.kind === "delete"} onConfirm={confirmPendingAction}/>
    </div>
  );
}
