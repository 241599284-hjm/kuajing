"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
import { FormEvent, useEffect, useState } from "react";
import {
  AdminActionRow,
  AdminField,
  AdminInlineStatus,
  AdminListCard,
  AdminNumberInput,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextInput,
  AdminToggleButton
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type CategoryRow = {
  slug: string;
  nameZh: string;
  nameEn: string;
  sortOrder: number;
  status: "active" | "inactive";
};

const initialCategories: CategoryRow[] = [
  { slug: "teapot", nameZh: "茶壶", nameEn: "Teapot", sortOrder: 10, status: "active" },
  { slug: "teacup", nameZh: "茶杯", nameEn: "Teacup", sortOrder: 20, status: "active" },
  { slug: "travel", nameZh: "旅行茶具", nameEn: "Travel", sortOrder: 30, status: "active" },
  { slug: "gift", nameZh: "礼品套装", nameEn: "Gift set", sortOrder: 40, status: "active" }
];

export function CategoryManagementPanel() {
  const [categories, setCategories] = useState(initialCategories);
  const [status, setStatus] = useState("已加载");

  useEffect(() => {
    let isMounted = true;

    async function loadCategories() {
      try {
        const response = await fetch(`${adminGatewayUrl}/catalog/categories`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(localizedErrorMessage(payload, response.status, "zh"));
        }

        const data = payload as Array<{
          slug: string;
          isVisible: boolean;
          sortOrder: number;
          copy: Record<string, { name: string }>;
        }>;

        if (!isMounted || data.length === 0) return;

        setCategories(data.map((category) => ({
          slug: category.slug,
          nameZh: category.copy.zh?.name ?? category.copy.en?.name ?? category.slug,
          nameEn: category.copy.en?.name ?? category.copy.zh?.name ?? category.slug,
          sortOrder: category.sortOrder,
          status: category.isVisible ? "active" : "inactive"
        })));
        setStatus("已从 catalog-service 加载");
      } catch (error) {
        setStatus(error instanceof TypeError ? "Catalog API 未连接，当前显示本地演示数据。" : error instanceof Error ? error.message : "读取商品分类失败。");
      }
    }

    void loadCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateCategory(slug: string, patch: Partial<CategoryRow>) {
    setCategories((items) => items.map((item) => (item.slug === slug ? { ...item, ...patch } : item)));
  }

  function addCategory() {
    const nextIndex = categories.length + 1;
    setCategories((items) => [
      ...items,
      {
        slug: `category-${nextIndex}`,
        nameZh: "新分类",
        nameEn: "New Category",
        sortOrder: nextIndex * 10,
        status: "inactive"
      }
    ]);
    setStatus("已新增，待保存");
  }

  async function saveCategories(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("保存中");

    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/categories`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": crypto.randomUUID()
        },
        body: JSON.stringify({ categories })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setStatus("已保存");
    } catch (error) {
      setStatus(error instanceof TypeError ? "Catalog API 未连接，本地已保留修改。" : error instanceof Error ? error.message : "分类保存失败。");
    }
  }

  return (
    <AdminPanel
      eyebrow="商品分类"
      id="category-management-title"
      status={status}
      title="商品分类、中英文名称和排序"
    >
      <form className="mt-5 grid gap-4" onSubmit={saveCategories}>
        <AdminActionRow>
          <AdminSecondaryButton onClick={addCategory} type="button">
            新增分类
          </AdminSecondaryButton>
          <p className="text-sm text-[var(--ink-soft)]">新增后可在商品管理里选择，用于前台筛选和商品详情归类。</p>
        </AdminActionRow>

        <div className="grid gap-4">
          {categories.map((category) => (
            <AdminListCard
              action={
                <AdminToggleButton
                  activeLabel="已启用"
                  inactiveLabel="已停用"
                  isActive={category.status === "active"}
                  onClick={() => updateCategory(category.slug, { status: category.status === "active" ? "inactive" : "active" })}
                  type="button"
                />
              }
              eyebrow={category.slug}
              key={category.slug}
              title={`${category.nameZh} / ${category.nameEn}`}
            >

              <div className="mt-4 grid gap-3 lg:grid-cols-[10rem_1fr_1fr_8rem]">
                <AdminField label="标识 slug">
                  <AdminTextInput onChange={(event) => updateCategory(category.slug, { slug: event.target.value })} value={category.slug} />
                </AdminField>
                <AdminField label="中文分类">
                  <AdminTextInput onChange={(event) => updateCategory(category.slug, { nameZh: event.target.value })} value={category.nameZh} />
                </AdminField>
                <AdminField label="英文分类">
                  <AdminTextInput onChange={(event) => updateCategory(category.slug, { nameEn: event.target.value })} value={category.nameEn} />
                </AdminField>
                <AdminField label="排序">
                  <AdminNumberInput min={0} onChange={(event) => updateCategory(category.slug, { sortOrder: Number(event.target.value) })} value={category.sortOrder} />
                </AdminField>
              </div>
            </AdminListCard>
          ))}
        </div>

        <AdminActionRow>
          <AdminPrimaryButton type="submit">
            保存分类配置
          </AdminPrimaryButton>
          <AdminInlineStatus>{status}</AdminInlineStatus>
        </AdminActionRow>
      </form>
    </AdminPanel>
  );
}
