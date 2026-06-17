"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
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

type MediaUploadResult = {
  url: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
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
  const [status, setStatus] = useState("已加载");
  const [imageStatuses, setImageStatuses] = useState<Record<string, string>>({});
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      try {
        const response = await fetch(`${adminGatewayUrl}/catalog/admin-products?page=1&size=100`, {
          headers: {
            "x-correlation-id": crypto.randomUUID()
          }
        });
        const payload = (await response.json().catch(() => ({}))) as AdminProductList;

        if (!response.ok || !Array.isArray(payload.items)) {
          throw new Error(localizedErrorMessage(payload, response.status, "zh"));
        }

        if (isMounted && !hasSubmittedRef.current && payload.items.length > 0) {
          setProducts(payload.items);
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

  async function saveProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    hasSubmittedRef.current = true;
    setStatus("保存中");

    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/products`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": crypto.randomUUID()
        },
        body: JSON.stringify({ products })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setStatus("已保存");
    } catch {
      setStatus("API 未连接，本地已保留修改");
    }
  }

  async function uploadCompressedDetailImage(sku: string, file: File) {
    setImageStatuses((items) => ({ ...items, [sku]: "正在压缩并上传" }));

    try {
      const image = await createImageBitmap(file);
      const maxWidth = 1600;
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("压缩失败：浏览器不支持图片处理");
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((output) => {
          if (!output) {
            reject(new Error("压缩失败：未生成图片"));
            return;
          }

          resolve(output);
        }, "image/webp", 0.78);
      });
      const formData = new FormData();
      formData.append("file", blob, `${sku.toLowerCase()}-detail.webp`);
      const response = await fetch(`${adminGatewayUrl}/media/product-assets`, {
        method: "POST",
        headers: {
          "x-correlation-id": crypto.randomUUID()
        },
        body: formData
      });
      const payload = (await response.json().catch(() => ({}))) as MediaUploadResult | { message?: string };

      if (!response.ok || !("url" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      const originalSize = Math.round(file.size / 1024);
      const uploadedSize = Math.round(payload.byteSize / 1024);
      updateProduct(sku, { imageUrl: payload.url });
      setImageStatuses((items) => ({
        ...items,
        [sku]: `已上传对象存储：${originalSize} KB → ${uploadedSize} KB，${payload.width ?? canvas.width}x${payload.height ?? canvas.height}`
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
                <AdminField label="详情图片上传（自动压缩）">
                  <AdminFileInput
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadCompressedDetailImage(product.sku, file);
                    }}
                  />
                </AdminField>
                <AdminField label="主图 URL">
                  <AdminTextInput onChange={(event) => updateProduct(product.sku, { imageUrl: event.target.value })} value={product.imageUrl} />
                </AdminField>
                <p className="text-sm text-[var(--ink-soft)] lg:col-span-2">
                  {imageStatuses[product.sku] ?? "上传前会按前台展示尺寸生成 WebP 压缩版本，再通过 media-service 保存到对象存储。"}
                </p>
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
