"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
import { Save, Upload } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { createRequestId } from "../lib/request-id.js";
import { createBlankProduct, normalizeProductDetail, type ProductDraft, type ProductMediaAsset } from "../lib/catalog-editor.js";
import { Button } from "./ui/button.js";
import { DetailDialog } from "./ui/dialog.js";
import { Field, Input, Textarea } from "./ui/input.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type UploadResult = Omit<ProductMediaAsset, "storageProvider" | "altTextZh" | "altTextEn" | "sortOrder" | "isPending"> & {
  provider: string;
};

const categories = [
  ["teapot", "茶壶 / Teapot"],
  ["teacup", "茶杯 / Teacup"],
  ["travel", "旅行茶具 / Travel"],
  ["gift", "礼品套装 / Gift set"]
] as const;
const regions = [
  ["beijing", "北京 / Beijing"],
  ["shanghai", "上海 / Shanghai"],
  ["jiangxi", "江西 / Jiangxi"],
  ["guangdong", "广东 / Guangdong"]
] as const;

export function ProductEditorDialog({
  open,
  mode,
  sku,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  mode: "create" | "edit";
  sku: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(createBlankProduct);
  const [removedMediaAssets, setRemovedMediaAssets] = useState<ProductMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("填写商品资料后保存");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) {
      setDraft(createBlankProduct());
      setRemovedMediaAssets([]);
      setLoading(false);
      setSaving(false);
      setUploading(false);
      setMessage("填写商品资料后保存");
      setConfirming(false);
      return;
    }
    if (mode === "create") {
      setDraft(createBlankProduct());
      setMessage("新增商品默认不立即上架");
      return;
    }
    if (!sku) return;

    const controller = new AbortController();
    setLoading(true);
    setMessage("正在读取完整商品数据");
    void fetch(`${adminGatewayUrl}/catalog/admin-products/${encodeURIComponent(sku)}`, {
      cache: "no-store",
      headers: { "x-correlation-id": createRequestId() },
      signal: controller.signal
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as Partial<ProductDraft>;
      if (!response.ok) throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      setDraft(normalizeProductDetail(payload));
      setMessage("已读取完整商品数据");
    }).catch((error) => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "商品详情读取失败");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, [mode, open, sku]);

  function patch(patchValue: Partial<ProductDraft>) {
    setDraft((current) => ({ ...current, ...patchValue }));
  }

  async function upload(file: File) {
    setUploading(true);
    setMessage(file.type === "image/gif" || file.type === "video/mp4" ? "正在处理媒体" : "正在转换 WebP 并上传");
    try {
      const formData = new FormData();
      if (file.type !== "image/gif" && file.type !== "video/mp4") {
        const image = await createImageBitmap(file);
        const scale = Math.min(1, 1600 / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器不支持图片转换");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("WebP 转换失败")), "image/webp", 0.78));
        formData.append("file", blob, `${(draft.sku || "product").toLowerCase()}-${Date.now()}.webp`);
      } else {
        formData.append("file", file, file.name);
      }
      const response = await fetch(`${adminGatewayUrl}/media/product-assets`, {
        method: "POST",
        headers: { "x-correlation-id": createRequestId() },
        body: formData
      });
      const payload = await response.json().catch(() => ({})) as UploadResult;
      if (!response.ok || !payload.assetId) throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      const asset: ProductMediaAsset = {
        ...payload,
        storageProvider: payload.provider,
        altTextZh: draft.nameZh,
        altTextEn: draft.nameEn,
        sortOrder: (draft.mediaAssets.at(-1)?.sortOrder ?? 0) + 10,
        isPending: true
      };
      setDraft((current) => ({
        ...current,
        imageUrl: current.mediaAssets.length ? current.imageUrl : asset.url,
        mediaAssets: [...current.mediaAssets, asset]
      }));
      setMessage("媒体已上传，保存商品后完成绑定");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "媒体上传失败");
    } finally {
      setUploading(false);
    }
  }

  function removeAsset(asset: ProductMediaAsset) {
    if (!asset.isPending) setRemovedMediaAssets((current) => [...current, asset]);
    setDraft((current) => {
      const mediaAssets = current.mediaAssets.filter((item) => item.assetId !== asset.assetId);
      return { ...current, mediaAssets, imageUrl: current.imageUrl === asset.url ? mediaAssets[0]?.url ?? "" : current.imageUrl };
    });
  }

  function requestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.sku.trim() || !draft.nameZh.trim() || !draft.nameEn.trim()) {
      setMessage("SKU、中英文商品名必须填写");
      return;
    }
    setConfirming(true);
  }

  async function save() {
    setSaving(true);
    setMessage("正在保存商品");
    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/products`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-correlation-id": createRequestId() },
        body: JSON.stringify({ products: [draft], removedMediaAssets })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      setMessage("商品已保存");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "商品保存失败");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "新增商品" : `修改商品 · ${sku ?? ""}`}
      description={message}
      loading={loading}
    >
      {loading ? <div className="grid min-h-64 place-items-center text-sm text-[var(--muted-foreground)]">正在加载完整商品资料</div> : (
        <form className="space-y-6" onSubmit={requestSave}>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="SKU"><Input disabled={mode === "edit"} value={draft.sku} onChange={(event) => patch({ sku: event.target.value.toUpperCase() })}/></Field>
            <Field label="美元价格"><Input min="0" step="0.01" type="number" value={draft.price} onChange={(event) => patch({ price: Number(event.target.value) })}/></Field>
            <Field label="分类"><select className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" value={draft.category} onChange={(event) => patch({ category: event.target.value })}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="地域"><select className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" value={draft.region} onChange={(event) => patch({ region: event.target.value })}>{regions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="中文商品名"><Input value={draft.nameZh} onChange={(event) => patch({ nameZh: event.target.value })}/></Field>
            <Field label="英文商品名"><Input value={draft.nameEn} onChange={(event) => patch({ nameEn: event.target.value })}/></Field>
            <Field label="状态"><select className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" value={draft.status} onChange={(event) => patch({ status: event.target.value as ProductDraft["status"] })}><option value="inactive">未上架</option><option value="active">已上架</option></select></Field>
            <Field label="原产国代码"><Input maxLength={2} value={draft.originCountry} onChange={(event) => patch({ originCountry: event.target.value.toUpperCase() })}/></Field>
          </section>

          <section className="grid gap-4 rounded-lg border border-[var(--border)] p-4 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="HS Code"><Input value={draft.hsCode} onChange={(event) => patch({ hsCode: event.target.value })}/></Field>
            <Field label="重量（克）"><Input min="0" type="number" value={draft.weightGrams} onChange={(event) => patch({ weightGrams: Number(event.target.value) })}/></Field>
            <Field label="中文材质"><Input value={draft.materialZh} onChange={(event) => patch({ materialZh: event.target.value })}/></Field>
            <Field label="英文材质"><Input value={draft.materialEn} onChange={(event) => patch({ materialEn: event.target.value })}/></Field>
            <Field label="中文产地"><Input value={draft.originZh} onChange={(event) => patch({ originZh: event.target.value })}/></Field>
            <Field label="英文产地"><Input value={draft.originEn} onChange={(event) => patch({ originEn: event.target.value })}/></Field>
            <Field label="中文容量"><Input value={draft.capacityZh} onChange={(event) => patch({ capacityZh: event.target.value })}/></Field>
            <Field label="英文容量"><Input value={draft.capacityEn} onChange={(event) => patch({ capacityEn: event.target.value })}/></Field>
            <Field label="包装长（mm）"><Input min="0" type="number" value={draft.packageLengthMm} onChange={(event) => patch({ packageLengthMm: Number(event.target.value) })}/></Field>
            <Field label="包装宽（mm）"><Input min="0" type="number" value={draft.packageWidthMm} onChange={(event) => patch({ packageWidthMm: Number(event.target.value) })}/></Field>
            <Field label="包装高（mm）"><Input min="0" type="number" value={draft.packageHeightMm} onChange={(event) => patch({ packageHeightMm: Number(event.target.value) })}/></Field>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="中文详情"><Textarea rows={6} value={draft.detailZh} onChange={(event) => patch({ detailZh: event.target.value })}/></Field>
            <Field label="英文详情"><Textarea rows={6} value={draft.detailEn} onChange={(event) => patch({ detailEn: event.target.value })}/></Field>
            <Field label="中文海关说明"><Textarea rows={3} value={draft.customsDeclarationZh} onChange={(event) => patch({ customsDeclarationZh: event.target.value })}/></Field>
            <Field label="英文海关说明"><Textarea rows={3} value={draft.customsDeclarationEn} onChange={(event) => patch({ customsDeclarationEn: event.target.value })}/></Field>
          </section>

          <section className="space-y-4 rounded-lg border border-dashed border-[var(--border)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-medium">商品媒体</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">普通图片自动转 WebP；GIF 自动生成 MP4 派生文件。</p></div>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm">
                <Upload size={15}/>上传媒体
                <input className="sr-only" disabled={uploading} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4" onChange={(event) => { for (const file of Array.from(event.target.files ?? [])) void upload(file); }}/>
              </label>
            </div>
            <Field label="主图 URL"><Input value={draft.imageUrl} onChange={(event) => patch({ imageUrl: event.target.value })}/></Field>
            {draft.mediaAssets.length ? <div className="grid gap-2">{draft.mediaAssets.map((asset) => <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--border)] p-3" key={asset.assetId}><img alt={asset.altTextZh || draft.nameZh} className="size-12 rounded object-cover" src={asset.posterUrl ?? asset.url}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{asset.originalName}</p><p className="truncate text-xs text-[var(--muted-foreground)]">{asset.mimeType} · 排序 {asset.sortOrder}{asset.isPending ? " · 待绑定" : ""}</p></div><Button type="button" size="sm" variant="outline" onClick={() => removeAsset(asset)}>移除</Button></div>)}</div> : <p className="text-sm text-[var(--muted-foreground)]">尚未上传媒体。</p>}
          </section>

          <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-white px-5 py-4 sm:-mx-6 sm:px-6">
            <span className={`text-xs ${confirming ? "text-[var(--warning)]" : "text-[var(--muted-foreground)]"}`}>{confirming ? draft.status === "active" ? "确认后商品将处于已上架状态，前台可能立即展示最新资料。" : "确认后商品将保存为未上架状态。" : message}</span>
            {confirming ? <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setConfirming(false)}>取消</Button><Button disabled={saving || uploading} type="button" onClick={() => void save()}><Save size={15}/>{saving ? "保存中" : "确认保存"}</Button></div> : <Button disabled={saving || uploading} type="submit"><Save size={15}/>保存商品</Button>}
          </div>
        </form>
      )}
    </DetailDialog>
  </>;
}
