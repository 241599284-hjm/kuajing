"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
import { Pencil, Plus, RefreshCw, Save, Tags } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { createBlankCategory, type CategoryDraft } from "../lib/catalog-editor.js";
import { createRequestId } from "../lib/request-id.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { DetailDialog } from "./ui/dialog.js";
import { Field, Input } from "./ui/input.js";
import { Table, TableWrap, Td, Th } from "./ui/table.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type CategoryApi = {
  slug: string;
  isVisible: boolean;
  sortOrder: number;
  copy: Record<string, { name: string }>;
};

function toDraft(category: CategoryApi): CategoryDraft {
  return {
    slug: category.slug,
    nameZh: category.copy.zh?.name ?? category.copy.en?.name ?? category.slug,
    nameEn: category.copy.en?.name ?? category.copy.zh?.name ?? category.slug,
    sortOrder: category.sortOrder,
    status: category.isVisible ? "active" : "inactive"
  };
}

export function CategoryManagementPanel() {
  const [categories, setCategories] = useState<CategoryDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("正在读取分类");
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; draft: CategoryDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("填写分类资料后保存");
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/categories`, {
        cache: "no-store",
        headers: { "x-correlation-id": createRequestId() }
      });
      const payload = await response.json().catch(() => []) as CategoryApi[];
      if (!response.ok || !Array.isArray(payload)) throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      setCategories(payload.map(toDraft));
      setStatus(`已同步 ${payload.length} 个分类`);
    } catch (error) {
      setCategories([]);
      setStatus(error instanceof Error ? error.message : "分类接口暂不可用");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setMessage("新增分类默认停用");
    setEditor({ mode: "create", draft: createBlankCategory(Math.max(0, ...categories.map((item) => item.sortOrder))) });
  }

  function openEdit(category: CategoryDraft) {
    setMessage("分类标识创建后不可修改");
    setEditor({ mode: "edit", draft: { ...category } });
  }

  function patch(value: Partial<CategoryDraft>) {
    setEditor((current) => current ? { ...current, draft: { ...current.draft, ...value } } : current);
  }

  function requestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    if (!editor.draft.slug.trim() || !editor.draft.nameZh.trim() || !editor.draft.nameEn.trim()) {
      setMessage("slug、中英文分类名必须填写");
      return;
    }
    setConfirming(true);
  }

  async function save() {
    if (!editor) return;
    setSaving(true);
    setMessage("正在保存分类");
    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/categories`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-correlation-id": createRequestId() },
        body: JSON.stringify({ categories: [editor.draft] })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      setEditor(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分类保存失败");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Card>
      <CardHeader>
        <div><CardTitle>商品分类</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">单行摘要 · {status}</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} size={14}/>刷新</Button>
          <Button size="sm" onClick={openCreate}><Plus size={14}/>新增分类</Button>
        </div>
      </CardHeader>
      {categories.length ? <TableWrap><Table className="table-fixed min-w-[720px]"><thead><tr><Th>标识</Th><Th>中文名称</Th><Th>英文名称</Th><Th>排序</Th><Th>状态</Th><Th className="sticky right-0 w-28 border-l text-right">操作</Th></tr></thead><tbody>{categories.map((category) => <tr className="h-12 hover:bg-[#fafbfc]" key={category.slug}><Td className="truncate font-medium">{category.slug}</Td><Td className="truncate">{category.nameZh}</Td><Td className="truncate">{category.nameEn}</Td><Td>{category.sortOrder}</Td><Td><Badge tone={category.status === "active" ? "success" : "neutral"}>{category.status === "active" ? "已启用" : "已停用"}</Badge></Td><Td className="sticky right-0 border-l bg-white text-right"><Button size="sm" variant="outline" onClick={() => openEdit(category)}><Pencil size={14}/>修改</Button></Td></tr>)}</tbody></Table></TableWrap> : <CardContent className="grid min-h-72 place-items-center text-sm text-[var(--muted-foreground)]"><span className="flex items-center gap-2"><Tags size={18}/>{status}</span></CardContent>}
    </Card>

    <DetailDialog open={editor !== null} onOpenChange={(open) => { if (!open && !saving) setEditor(null); }} title={editor?.mode === "create" ? "新增分类" : `修改分类 · ${editor?.draft.slug ?? ""}`} description={message} loading={false}>
      {editor ? <form className="space-y-5" onSubmit={requestSave}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="分类标识 slug"><Input disabled={editor.mode === "edit"} value={editor.draft.slug} onChange={(event) => patch({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}/></Field>
          <Field label="排序"><Input min="0" type="number" value={editor.draft.sortOrder} onChange={(event) => patch({ sortOrder: Number(event.target.value) })}/></Field>
          <Field label="中文分类名"><Input value={editor.draft.nameZh} onChange={(event) => patch({ nameZh: event.target.value })}/></Field>
          <Field label="英文分类名"><Input value={editor.draft.nameEn} onChange={(event) => patch({ nameEn: event.target.value })}/></Field>
          <Field label="状态"><select className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" value={editor.draft.status} onChange={(event) => patch({ status: event.target.value as CategoryDraft["status"] })}><option value="inactive">停用</option><option value="active">启用</option></select></Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4"><span className={`text-xs ${confirming ? "text-[var(--warning)]" : "text-[var(--muted-foreground)]"}`}>{confirming ? editor.draft.status === "active" ? "确认后该分类将在前台启用。" : "确认后该分类将保持停用。" : message}</span>{confirming ? <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setConfirming(false)}>取消</Button><Button disabled={saving} type="button" onClick={() => void save()}><Save size={15}/>{saving ? "保存中" : "确认保存"}</Button></div> : <Button disabled={saving} type="submit"><Save size={15}/>保存分类</Button>}</div>
      </form> : null}
    </DetailDialog>
  </>;
}
