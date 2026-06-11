"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AdminActionRow,
  AdminField,
  AdminInlineStatus,
  AdminListCard,
  AdminNumberInput,
  AdminPanel,
  AdminPrimaryButton,
  AdminSelect,
  AdminTextInput,
  AdminToggleButton
} from "./admin-ui.js";

type DiscountRow = {
  code: string;
  nameZh: string;
  nameEn: string;
  type: "amount" | "percent";
  value: number;
  sortOrder: number;
  status: "active" | "inactive";
};

type DiscountSort = "sortOrder" | "valueDesc" | "status";

const initialDiscounts: DiscountRow[] = [
  {
    code: "BEIJING10",
    nameZh: "北京定制瓷器优惠",
    nameEn: "Beijing custom porcelain offer",
    type: "percent",
    value: 10,
    sortOrder: 10,
    status: "active"
  },
  {
    code: "GIFT20",
    nameZh: "礼品套装立减",
    nameEn: "Gift set fixed discount",
    type: "amount",
    value: 20,
    sortOrder: 20,
    status: "active"
  },
  {
    code: "TRAVEL8",
    nameZh: "旅行茶具优惠",
    nameEn: "Travel teaware offer",
    type: "percent",
    value: 8,
    sortOrder: 30,
    status: "inactive"
  }
];

export function DiscountManagementPanel() {
  const [discounts, setDiscounts] = useState<DiscountRow[]>(initialDiscounts);
  const [sort, setSort] = useState<DiscountSort>("sortOrder");
  const [status, setStatus] = useState("已加载");

  const sortedDiscounts = useMemo(() => {
    return [...discounts].sort((left, right) => {
      if (sort === "valueDesc") return right.value - left.value;
      if (sort === "status") return left.status.localeCompare(right.status);
      return left.sortOrder - right.sortOrder;
    });
  }, [discounts, sort]);

  function updateDiscount(code: string, patch: Partial<DiscountRow>) {
    setDiscounts((items) => items.map((item) => (item.code === code ? { ...item, ...patch } : item)));
  }

  function saveDiscounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("已保存");
  }

  return (
    <AdminPanel
      eyebrow="促销运营"
      id="discount-management-title"
      status={status}
      title="折扣金额、排序和中英文内容"
    >
      <div className="mt-5 max-w-64">
        <AdminField label="折扣排序">
          <AdminSelect onChange={(event) => setSort(event.target.value as DiscountSort)} value={sort}>
            <option value="sortOrder">按排序值</option>
            <option value="valueDesc">按折扣力度从高到低</option>
            <option value="status">按状态</option>
          </AdminSelect>
        </AdminField>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={saveDiscounts}>
        {sortedDiscounts.map((discount) => (
          <AdminListCard
            action={
              <AdminToggleButton
                activeLabel="已启用"
                inactiveLabel="已停用"
                isActive={discount.status === "active"}
                onClick={() => updateDiscount(discount.code, { status: discount.status === "active" ? "inactive" : "active" })}
                type="button"
              />
            }
            description={discount.nameEn}
            eyebrow={discount.code}
            key={discount.code}
            title={discount.nameZh}
          >

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_8rem_8rem_8rem]">
              <AdminField label="中文折扣名">
                <AdminTextInput onChange={(event) => updateDiscount(discount.code, { nameZh: event.target.value })} value={discount.nameZh} />
              </AdminField>
              <AdminField label="英文折扣名">
                <AdminTextInput onChange={(event) => updateDiscount(discount.code, { nameEn: event.target.value })} value={discount.nameEn} />
              </AdminField>
              <AdminField label="类型">
                <AdminSelect onChange={(event) => updateDiscount(discount.code, { type: event.target.value as DiscountRow["type"] })} value={discount.type}>
                  <option value="amount">固定金额</option>
                  <option value="percent">百分比</option>
                </AdminSelect>
              </AdminField>
              <AdminField label="折扣金额或比例">
                <AdminNumberInput min={0} onChange={(event) => updateDiscount(discount.code, { value: Number(event.target.value) })} value={discount.value} />
              </AdminField>
              <AdminField label="排序值">
                <AdminNumberInput min={0} onChange={(event) => updateDiscount(discount.code, { sortOrder: Number(event.target.value) })} value={discount.sortOrder} />
              </AdminField>
            </div>
          </AdminListCard>
        ))}

        <AdminActionRow>
          <AdminPrimaryButton type="submit">
            保存折扣
          </AdminPrimaryButton>
          <AdminInlineStatus>{status}</AdminInlineStatus>
        </AdminActionRow>
      </form>
    </AdminPanel>
  );
}
