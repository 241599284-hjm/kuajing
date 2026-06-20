"use client";

import { createRequestId } from "../lib/request-id.js";
import { localizedErrorMessage } from "@commerce/error-codes";
import { ArrowDown, ArrowUp } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AdminActionRow,
  AdminField,
  AdminFileInput,
  AdminInlineStatus,
  AdminListCard,
  AdminNumberInput,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSelect,
  AdminTextInput,
  AdminTextarea,
  AdminToggleButton
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type ProductRow = {
  sku: string;
  nameZh: string;
  nameEn: string;
  category: string;
  region: string;
  price: number;
  detailZh: string;
  detailEn: string;
  imageUrl: string;
  mediaAssets: ProductMediaAsset[];
  materialZh: string;
  materialEn: string;
  originZh: string;
  originEn: string;
  originCountry: string;
  capacityZh: string;
  capacityEn: string;
  hsCode: string;
  packageLengthMm: number;
  packageWidthMm: number;
  packageHeightMm: number;
  weightGrams: number;
  customsDeclarationZh: string;
  customsDeclarationEn: string;
  status: "active" | "inactive";
};

type ProductMediaAsset = {
  assetId: string;
  kind: "image" | "gif" | "video";
  url: string;
  objectKey: string;
  storageProvider: string;
  originalName: string;
  mimeType: string;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  variants: Record<string, string>;
  responsiveSources: ResponsiveMediaSource[];
  altTextZh: string;
  altTextEn: string;
  sortOrder: number;
  isPending?: boolean;
};

type ResponsiveMediaSource = {
  url: string;
  objectKey: string;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
};

type MediaUploadResult = {
  assetId: string;
  provider: string;
  kind: "image" | "gif" | "video";
  url: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  variants: Record<string, string>;
  responsiveSources: ResponsiveMediaSource[];
  posterUrl: string | null;
  durationSeconds: number | null;
};

type AdminProductList = {
  items: ProductRow[];
  page: number;
  size: number;
  total: number;
};

const productCategories = [
  { value: "teapot", label: "茶壶 / Teapot" },
  { value: "teacup", label: "茶杯 / Teacup" },
  { value: "travel", label: "旅行茶具 / Travel" },
  { value: "gift", label: "礼品套装 / Gift set" }
] as const;

const cityCategories = [
  { value: "beijing", label: "北京 / Beijing" },
  { value: "shanghai", label: "上海 / Shanghai" },
  { value: "jiangxi", label: "江西 / Jiangxi" },
  { value: "guangdong", label: "广东 / Guangdong" }
] as const;

const initialProducts: ProductRow[] = [
  {
    sku: "DT-SET-001",
    nameZh: "白瓷功夫茶具套装",
    nameEn: "Porcelain Tea Set",
    category: "gift",
    region: "jiangxi",
    price: 96,
    detailZh: "白瓷茶具套装图文介绍内容。",
    detailEn: "Porcelain tea set image-text introduction.",
    imageUrl: "",
    mediaAssets: [],
    materialZh: "白瓷陶瓷",
    materialEn: "Porcelain ceramic",
    originZh: "中国",
    originEn: "China",
    originCountry: "CN",
    capacityZh: "茶壶 180 ml，茶杯 40 ml",
    capacityEn: "Teapot 180 ml, cups 40 ml",
    hsCode: "6911.10",
    packageLengthMm: 320,
    packageWidthMm: 240,
    packageHeightMm: 120,
    weightGrams: 1500,
    customsDeclarationZh: "家用茶具白瓷套装",
    customsDeclarationEn: "Porcelain teaware set for household tea brewing",
    status: "active"
  },
  {
    sku: "DT-POT-002",
    nameZh: "宜兴紫砂壶",
    nameEn: "Yixing Clay Pot",
    category: "teapot",
    region: "beijing",
    price: 128,
    detailZh: "紫砂壶图文介绍内容。",
    detailEn: "Yixing clay pot image-text introduction.",
    imageUrl: "",
    mediaAssets: [],
    materialZh: "宜兴紫砂陶",
    materialEn: "Yixing clay",
    originZh: "中国",
    originEn: "China",
    originCountry: "CN",
    capacityZh: "茶壶 160 ml",
    capacityEn: "Teapot 160 ml",
    hsCode: "6912.00",
    packageLengthMm: 220,
    packageWidthMm: 180,
    packageHeightMm: 140,
    weightGrams: 900,
    customsDeclarationZh: "紫砂陶茶壶",
    customsDeclarationEn: "Yixing clay teapot for tea brewing",
    status: "active"
  },
  {
    sku: "DT-TRV-003",
    nameZh: "旅行茶具套装",
    nameEn: "Travel Tea Kit",
    category: "travel",
    region: "shanghai",
    price: 72,
    detailZh: "旅行茶具图文介绍内容。",
    detailEn: "Travel tea kit image-text introduction.",
    imageUrl: "",
    mediaAssets: [],
    materialZh: "陶瓷与收纳盒",
    materialEn: "Ceramic with travel case",
    originZh: "中国",
    originEn: "China",
    originCountry: "CN",
    capacityZh: "便携壶 120 ml，杯 35 ml",
    capacityEn: "Travel pot 120 ml, cups 35 ml",
    hsCode: "6911.10",
    packageLengthMm: 260,
    packageWidthMm: 180,
    packageHeightMm: 100,
    weightGrams: 800,
    customsDeclarationZh: "旅行便携陶瓷茶具",
    customsDeclarationEn: "Portable ceramic travel tea kit",
    status: "inactive"
  }
];

export function ProductManagementPanel() {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [removedMediaAssets, setRemovedMediaAssets] = useState<ProductMediaAsset[]>([]);
  const [status, setStatus] = useState("已加载");
  const [imageStatuses, setImageStatuses] = useState<Record<string, string>>({});
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      try {
        const response = await fetch(`${adminGatewayUrl}/catalog/admin-products?page=1&size=100`, {
          headers: {
            "x-correlation-id": createRequestId()
          }
        });
        const payload = (await response.json().catch(() => ({}))) as AdminProductList;

        if (!response.ok || !Array.isArray(payload.items)) {
          throw new Error(localizedErrorMessage(payload, response.status, "zh"));
        }

        if (isMounted && !hasSubmittedRef.current && payload.items.length > 0) {
          setProducts(payload.items.map((product) => ({ ...product, mediaAssets: product.mediaAssets ?? [] })));
          setStatus(`已从 catalog-service 加载 ${payload.items.length} 个商品`);
        }
      } catch {
        if (isMounted && !hasSubmittedRef.current) {
          setStatus("本地演示数据，API 未连接");
        }
      }
    }

    void loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateProduct(sku: string, patch: Partial<ProductRow>) {
    setProducts((items) => items.map((item) => (item.sku === sku ? { ...item, ...patch } : item)));
  }

  function updateMediaAsset(sku: string, assetId: string, patch: Partial<ProductMediaAsset>) {
    setProducts((items) => items.map((product) => product.sku === sku ? {
      ...product,
      mediaAssets: product.mediaAssets.map((asset) => asset.assetId === assetId ? { ...asset, ...patch } : asset)
    } : product));
  }

  function moveMediaAsset(sku: string, assetId: string, direction: -1 | 1) {
    setProducts((items) => items.map((product) => {
      if (product.sku !== sku) return product;
      const orderedAssets = product.mediaAssets.slice().sort((left, right) => left.sortOrder - right.sortOrder);
      const currentIndex = orderedAssets.findIndex((asset) => asset.assetId === assetId);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedAssets.length) return product;

      [orderedAssets[currentIndex], orderedAssets[targetIndex]] = [orderedAssets[targetIndex], orderedAssets[currentIndex]];
      const mediaAssets = orderedAssets.map((asset, index) => ({ ...asset, sortOrder: (index + 1) * 10 }));
      return {
        ...product,
        imageUrl: mediaAssets[0]?.url ?? product.imageUrl,
        mediaAssets
      };
    }));
  }

  async function removeMediaAsset(sku: string, asset: ProductMediaAsset) {
    try {
      if (asset.isPending) {
        await Promise.all([asset.objectKey, ...asset.responsiveSources.map((source) => source.objectKey)].map(async (objectKey) => {
          const response = await fetch(`${adminGatewayUrl}/media/product-assets`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json", "x-correlation-id": createRequestId() },
            body: JSON.stringify({ assetId: asset.assetId, objectKey, reason: "Pending upload removed before catalog binding" })
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(localizedErrorMessage(payload, response.status, "zh"));
          }
        }));
      } else {
        setRemovedMediaAssets((items) => items.some((item) => item.assetId === asset.assetId) ? items : [...items, asset]);
      }

      setProducts((items) => items.map((product) => product.sku === sku ? {
        ...product,
        mediaAssets: product.mediaAssets.filter((item) => item.assetId !== asset.assetId),
        imageUrl: product.imageUrl === asset.url
          ? product.mediaAssets.find((item) => item.assetId !== asset.assetId)?.url ?? ""
          : product.imageUrl
      } : product));
      setStatus(asset.isPending ? "待绑定媒体已删除" : "媒体将在保存商品后删除");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "媒体删除失败");
    }
  }

  async function saveProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    hasSubmittedRef.current = true;
    setStatus("保存中");

    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/products`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify({ products, removedMediaAssets })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (response.status >= 400 && response.status < 500) {
          setProducts((items) => items.map((product) => ({
            ...product,
            mediaAssets: product.mediaAssets.filter((asset) => !asset.isPending)
          })));
        }
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setProducts((items) => items.map((product) => ({
        ...product,
        mediaAssets: product.mediaAssets.map((asset) => ({ ...asset, isPending: false }))
      })));
      setRemovedMediaAssets([]);
      setStatus("已保存");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function uploadDetailMedia(sku: string, file: File) {
    const shouldCompress = file.type !== "image/gif" && file.type !== "video/mp4";
    setImageStatuses((items) => ({
      ...items,
      [sku]: shouldCompress ? "正在压缩并上传" : "正在处理并上传媒体"
    }));

    try {
      const formData = new FormData();
      if (shouldCompress) {
        const image = await createImageBitmap(file);
        const maxWidth = 1600;
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");

        if (!context) throw new Error("压缩失败：浏览器不支持图片处理");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((output) => output ? resolve(output) : reject(new Error("压缩失败：未生成图片")), "image/webp", 0.78);
        });
        formData.append("file", blob, `${sku.toLowerCase()}-detail.webp`);
      } else {
        formData.append("file", file, file.name);
      }
      const response = await fetch(`${adminGatewayUrl}/media/product-assets`, {
        method: "POST",
        headers: {
          "x-correlation-id": createRequestId()
        },
        body: formData
      });
      const payload = (await response.json().catch(() => ({}))) as MediaUploadResult | { message?: string };

      if (!response.ok || !("url" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      const originalSize = Math.round(file.size / 1024);
      const uploadedSize = Math.round(payload.byteSize / 1024);
      setProducts((items) => items.map((product) => {
        if (product.sku !== sku) return product;
        const sortOrder = product.mediaAssets.length === 0
          ? 10
          : Math.max(...product.mediaAssets.map((asset) => asset.sortOrder)) + 10;
        const mediaAsset: ProductMediaAsset = {
          assetId: payload.assetId,
          kind: payload.kind,
          url: payload.url,
          objectKey: payload.objectKey,
          storageProvider: payload.provider,
          originalName: payload.originalName,
          mimeType: payload.mimeType,
          byteSize: payload.byteSize,
          width: payload.width,
          height: payload.height,
          posterUrl: payload.posterUrl,
          durationSeconds: payload.durationSeconds,
          variants: payload.variants,
          responsiveSources: payload.responsiveSources,
          altTextZh: product.nameZh,
          altTextEn: product.nameEn,
          sortOrder,
          isPending: true
        };
        return {
          ...product,
          imageUrl: product.mediaAssets.length === 0 ? payload.url : product.imageUrl,
          mediaAssets: [...product.mediaAssets, mediaAsset]
        };
      }));
      setImageStatuses((items) => ({
        ...items,
        [sku]: `已上传对象存储：${originalSize} KB → ${uploadedSize} KB，${payload.width ?? "?"}x${payload.height ?? "?"}`
      }));
    } catch (error) {
      setImageStatuses((items) => ({
        ...items,
        [sku]: error instanceof Error ? error.message : "上传失败"
      }));
    }
  }

  return (
    <AdminPanel
      eyebrow="商品运营"
      id="product-management-title"
      status={status}
      title="商品上下架、价格和中英文名称"
    >
      <form className="mt-5 grid gap-4" onSubmit={saveProducts}>
        <div className="grid gap-4">
          {products.map((product) => (
            <AdminListCard
              action={
                <AdminToggleButton
                  activeLabel="已上架"
                  inactiveLabel="已下架"
                  isActive={product.status === "active"}
                  onClick={() => updateProduct(product.sku, { status: product.status === "active" ? "inactive" : "active" })}
                  type="button"
                />
              }
              description={product.nameEn}
              eyebrow={product.sku}
              key={product.sku}
              title={product.nameZh}
            >

              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_8rem_8rem_8rem]">
                <AdminField label="中文商品名">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { nameZh: event.target.value })} value={product.nameZh} />
                </AdminField>
                <AdminField label="英文商品名">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { nameEn: event.target.value })} value={product.nameEn} />
                </AdminField>
                <AdminField label="美元价格">
                  <AdminNumberInput min={0} onChange={(event) => updateProduct(product.sku, { price: Number(event.target.value) })} value={product.price} />
                </AdminField>
                <AdminField label="分类">
                  <AdminSelect onChange={(event) => updateProduct(product.sku, { category: event.target.value as ProductRow["category"] })} value={product.category}>
                    {productCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                  </AdminSelect>
                </AdminField>
                <AdminField label="城市分类">
                  <AdminSelect onChange={(event) => updateProduct(product.sku, { region: event.target.value as ProductRow["region"] })} value={product.region}>
                    {cityCategories.map((city) => <option key={city.value} value={city.value}>{city.label}</option>)}
                  </AdminSelect>
                </AdminField>
              </div>

              <div className="mt-4 grid gap-3 rounded-md border border-[var(--line)] p-4 lg:grid-cols-3">
                <AdminField label="HS Code">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { hsCode: event.target.value })} value={product.hsCode} />
                </AdminField>
                <AdminField label="原产国代码">
                  <AdminTextInput
                    maxLength={2}
                    onChange={(event) => updateProduct(product.sku, { originCountry: event.target.value.toUpperCase() })}
                    value={product.originCountry}
                  />
                </AdminField>
                <AdminField label="重量（克）">
                  <AdminNumberInput
                    min={0}
                    onChange={(event) => updateProduct(product.sku, { weightGrams: Number(event.target.value) })}
                    value={product.weightGrams}
                  />
                </AdminField>
                <AdminField label="中文材质">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { materialZh: event.target.value })} value={product.materialZh} />
                </AdminField>
                <AdminField label="英文材质">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { materialEn: event.target.value })} value={product.materialEn} />
                </AdminField>
                <AdminField label="中文产地">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { originZh: event.target.value })} value={product.originZh} />
                </AdminField>
                <AdminField label="英文产地">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { originEn: event.target.value })} value={product.originEn} />
                </AdminField>
                <AdminField label="中文容量规格">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { capacityZh: event.target.value })} value={product.capacityZh} />
                </AdminField>
                <AdminField label="英文容量规格">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { capacityEn: event.target.value })} value={product.capacityEn} />
                </AdminField>
                <AdminField label="包装长（mm）">
                  <AdminNumberInput
                    min={0}
                    onChange={(event) => updateProduct(product.sku, { packageLengthMm: Number(event.target.value) })}
                    value={product.packageLengthMm}
                  />
                </AdminField>
                <AdminField label="包装宽（mm）">
                  <AdminNumberInput
                    min={0}
                    onChange={(event) => updateProduct(product.sku, { packageWidthMm: Number(event.target.value) })}
                    value={product.packageWidthMm}
                  />
                </AdminField>
                <AdminField label="包装高（mm）">
                  <AdminNumberInput
                    min={0}
                    onChange={(event) => updateProduct(product.sku, { packageHeightMm: Number(event.target.value) })}
                    value={product.packageHeightMm}
                  />
                </AdminField>
                <AdminField className="lg:col-span-3" label="中文海关说明">
                  <AdminTextInput
                    onChange={(event) => updateProduct(product.sku, { customsDeclarationZh: event.target.value })}
                    value={product.customsDeclarationZh}
                  />
                </AdminField>
                <AdminField className="lg:col-span-3" label="英文海关说明">
                  <AdminTextInput
                    onChange={(event) => updateProduct(product.sku, { customsDeclarationEn: event.target.value })}
                    value={product.customsDeclarationEn}
                  />
                </AdminField>
              </div>

              <div className="mt-4 grid gap-3 rounded-md border border-dashed border-[var(--line)] p-4 lg:grid-cols-2">
                <AdminField label="中文详情图文">
                  <AdminTextarea onChange={(event) => updateProduct(product.sku, { detailZh: event.target.value })} value={product.detailZh} />
                </AdminField>
                <AdminField label="英文详情图文">
                  <AdminTextarea onChange={(event) => updateProduct(product.sku, { detailEn: event.target.value })} value={product.detailEn} />
                </AdminField>
                <AdminField label="详情媒体上传（图片自动压缩，GIF 自动转视频）">
                  <AdminFileInput
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
                    multiple
                    onChange={(event) => {
                      for (const file of Array.from(event.target.files ?? [])) {
                        void uploadDetailMedia(product.sku, file);
                      }
                    }}
                  />
                </AdminField>
                <AdminField label="主图 URL">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { imageUrl: event.target.value })} value={product.imageUrl} />
                </AdminField>
                <p className="text-sm text-[var(--ink-soft)] lg:col-span-2">
                  {imageStatuses[product.sku] ?? "上传前会按前台展示尺寸生成 WebP 压缩版本，再通过 media-service 保存到对象存储。"}
                </p>
                {product.mediaAssets.length > 0 ? (
                  <div className="grid gap-3 lg:col-span-2">
                    {product.mediaAssets.slice().sort((left, right) => left.sortOrder - right.sortOrder).map((asset, index, orderedAssets) => (
                      <AdminListCard
                        action={
                          <AdminActionRow>
                            <AdminSecondaryButton
                              aria-label="上移媒体"
                              className="w-11 px-0"
                              disabled={index === 0}
                              onClick={() => moveMediaAsset(product.sku, asset.assetId, -1)}
                              title="上移"
                              type="button"
                            >
                              <ArrowUp aria-hidden="true" size={16} />
                            </AdminSecondaryButton>
                            <AdminSecondaryButton
                              aria-label="下移媒体"
                              className="w-11 px-0"
                              disabled={index === orderedAssets.length - 1}
                              onClick={() => moveMediaAsset(product.sku, asset.assetId, 1)}
                              title="下移"
                              type="button"
                            >
                              <ArrowDown aria-hidden="true" size={16} />
                            </AdminSecondaryButton>
                            <AdminSecondaryButton type="button" onClick={() => void removeMediaAsset(product.sku, asset)}>
                              移除
                            </AdminSecondaryButton>
                          </AdminActionRow>
                        }
                        description={`${asset.mimeType} · ${Math.round((asset.byteSize ?? 0) / 1024)} KB${asset.isPending ? " · 待绑定" : ""}`}
                        eyebrow={`排序 ${asset.sortOrder}`}
                        key={asset.assetId}
                        title={asset.originalName}
                      >
                        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_8rem]">
                          <AdminField label="中文图片 Alt">
                            <AdminTextInput value={asset.altTextZh} onChange={(event) => updateMediaAsset(product.sku, asset.assetId, { altTextZh: event.target.value })} />
                          </AdminField>
                          <AdminField label="英文图片 Alt">
                            <AdminTextInput value={asset.altTextEn} onChange={(event) => updateMediaAsset(product.sku, asset.assetId, { altTextEn: event.target.value })} />
                          </AdminField>
                          <AdminField label="展示顺序">
                            <AdminNumberInput min={0} value={asset.sortOrder} onChange={(event) => updateMediaAsset(product.sku, asset.assetId, { sortOrder: Number(event.target.value) })} />
                          </AdminField>
                        </div>
                      </AdminListCard>
                    ))}
                  </div>
                ) : null}
              </div>
            </AdminListCard>
          ))}
        </div>

        <AdminActionRow>
          <AdminPrimaryButton type="submit">
            保存商品修改
          </AdminPrimaryButton>
          <AdminInlineStatus>{status}</AdminInlineStatus>
        </AdminActionRow>
      </form>
    </AdminPanel>
  );
}
