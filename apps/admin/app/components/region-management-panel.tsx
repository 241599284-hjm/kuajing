"use client";

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
  AdminSelect,
  AdminTextInput,
  AdminToggleButton
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type RegionRow = {
  slug: string;
  nameZh: string;
  nameEn: string;
  landmarkZh: string;
  landmarkEn: string;
  icon: "palace" | "skyline" | "pavilion" | "wall" | "mountain" | "bridge" | "tower" | "water" | "statue" | "pagoda";
  sortOrder: number;
  showOnHomepage: boolean;
  status: "active" | "inactive";
};

const regionIcons = [
  { value: "palace", label: "宫殿线稿" },
  { value: "skyline", label: "城市天际线" },
  { value: "pavilion", label: "亭阁线稿" },
  { value: "wall", label: "长城线稿" },
  { value: "mountain", label: "山脉线稿" },
  { value: "bridge", label: "桥梁线稿" },
  { value: "tower", label: "高塔线稿" },
  { value: "water", label: "山水线稿" },
  { value: "statue", label: "佛像线稿" },
  { value: "pagoda", label: "宝塔线稿" }
] as const;

const initialRegions: RegionRow[] = [
  { slug: "beijing", nameZh: "北京", nameEn: "Beijing", landmarkZh: "天安门", landmarkEn: "Tiananmen", icon: "palace", sortOrder: 10, showOnHomepage: true, status: "active" },
  { slug: "shanghai", nameZh: "上海", nameEn: "Shanghai", landmarkZh: "东方明珠", landmarkEn: "Oriental Pearl Tower", icon: "skyline", sortOrder: 20, showOnHomepage: true, status: "active" },
  { slug: "jiangxi", nameZh: "江西", nameEn: "Jiangxi", landmarkZh: "滕王阁", landmarkEn: "Tengwang Pavilion", icon: "pavilion", sortOrder: 30, showOnHomepage: true, status: "active" },
  { slug: "guangdong", nameZh: "广东", nameEn: "Guangdong", landmarkZh: "广州塔", landmarkEn: "Canton Tower", icon: "tower", sortOrder: 40, showOnHomepage: true, status: "active" }
];

export function RegionManagementPanel() {
  const [regions, setRegions] = useState(initialRegions);
  const [status, setStatus] = useState("已加载");

  useEffect(() => {
    let isMounted = true;

    async function loadRegions() {
      try {
        const response = await fetch(`${adminGatewayUrl}/catalog/regions`);
        if (!response.ok) return;

        const data = (await response.json()) as Array<{
          slug: string;
          icon: RegionRow["icon"];
          isVisible: boolean;
          showOnHomepage: boolean;
          sortOrder: number;
          copy: Record<string, { name: string; landmark: string }>;
        }>;

        if (!isMounted || data.length === 0) return;

        setRegions(data.map((region) => ({
          slug: region.slug,
          nameZh: region.copy.zh?.name ?? region.copy.en?.name ?? region.slug,
          nameEn: region.copy.en?.name ?? region.copy.zh?.name ?? region.slug,
          landmarkZh: region.copy.zh?.landmark ?? region.copy.en?.landmark ?? "",
          landmarkEn: region.copy.en?.landmark ?? region.copy.zh?.landmark ?? "",
          icon: region.icon,
          sortOrder: region.sortOrder,
          showOnHomepage: region.showOnHomepage,
          status: region.isVisible ? "active" : "inactive"
        })));
        setStatus("已从 catalog-service 加载");
      } catch {
        setStatus("本地演示数据，API 未连接");
      }
    }

    void loadRegions();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateRegion(slug: string, patch: Partial<RegionRow>) {
    setRegions((items) => items.map((item) => (item.slug === slug ? { ...item, ...patch } : item)));
  }

  function addRegion() {
    const nextIndex = regions.length + 1;
    setRegions((items) => [
      ...items,
      {
        slug: `region-${nextIndex}`,
        nameZh: "新省份",
        nameEn: "New Region",
        landmarkZh: "地标名称",
        landmarkEn: "Landmark",
        icon: "palace",
        sortOrder: nextIndex * 10,
        showOnHomepage: false,
        status: "inactive"
      }
    ]);
    setStatus("已新增，待保存");
  }

  async function saveRegions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("保存中");

    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/regions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": crypto.randomUUID()
        },
        body: JSON.stringify({ regions })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus("已保存");
    } catch {
      setStatus("API 未连接，本地已保留修改");
    }
  }

  return (
    <AdminPanel
      eyebrow="地域配置"
      id="region-management-title"
      status={status}
      title="省份城市分类、矢量样式和首页展示"
    >
      <form className="mt-5 grid gap-4" onSubmit={saveRegions}>
        <AdminActionRow>
          <AdminSecondaryButton onClick={addRegion} type="button">
            新增省份
          </AdminSecondaryButton>
          <p className="text-sm text-[var(--ink-soft)]">新增后填写中英文内容，选择矢量图样式，保存后可用于商品城市分类。</p>
        </AdminActionRow>

        <div className="grid gap-4">
          {regions.map((region) => (
            <AdminListCard
              action={
                <AdminToggleButton
                  activeLabel="已启用"
                  inactiveLabel="已停用"
                  isActive={region.status === "active"}
                  onClick={() => updateRegion(region.slug, { status: region.status === "active" ? "inactive" : "active" })}
                  type="button"
                />
              }
              description={`${region.landmarkZh} / ${region.landmarkEn}`}
              eyebrow={region.slug}
              key={region.slug}
              title={`${region.nameZh} / ${region.nameEn}`}
            >

              <div className="mt-4 grid gap-3 lg:grid-cols-[9rem_1fr_1fr_1fr_1fr_9rem_7rem]">
                <AdminField label="标识 slug">
                  <AdminTextInput onChange={(event) => updateRegion(region.slug, { slug: event.target.value })} value={region.slug} />
                </AdminField>
                <AdminField label="中文省份">
                  <AdminTextInput onChange={(event) => updateRegion(region.slug, { nameZh: event.target.value })} value={region.nameZh} />
                </AdminField>
                <AdminField label="英文省份">
                  <AdminTextInput onChange={(event) => updateRegion(region.slug, { nameEn: event.target.value })} value={region.nameEn} />
                </AdminField>
                <AdminField label="中文地标">
                  <AdminTextInput onChange={(event) => updateRegion(region.slug, { landmarkZh: event.target.value })} value={region.landmarkZh} />
                </AdminField>
                <AdminField label="英文地标">
                  <AdminTextInput onChange={(event) => updateRegion(region.slug, { landmarkEn: event.target.value })} value={region.landmarkEn} />
                </AdminField>
                <AdminField label="矢量样式">
                  <AdminSelect onChange={(event) => updateRegion(region.slug, { icon: event.target.value as RegionRow["icon"] })} value={region.icon}>
                    {regionIcons.map((icon) => <option key={icon.value} value={icon.value}>{icon.label}</option>)}
                  </AdminSelect>
                </AdminField>
                <AdminField label="排序">
                  <AdminNumberInput min={0} onChange={(event) => updateRegion(region.slug, { sortOrder: Number(event.target.value) })} value={region.sortOrder} />
                </AdminField>
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm font-medium">
                <input checked={region.showOnHomepage} onChange={(event) => updateRegion(region.slug, { showOnHomepage: event.target.checked })} type="checkbox" />
                首页默认展示
              </label>
            </AdminListCard>
          ))}
        </div>

        <AdminActionRow>
          <AdminPrimaryButton type="submit">
            保存地域配置
          </AdminPrimaryButton>
          <AdminInlineStatus>{status}</AdminInlineStatus>
        </AdminActionRow>
      </form>
    </AdminPanel>
  );
}
