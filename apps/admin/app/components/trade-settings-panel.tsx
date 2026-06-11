"use client";

import { FormEvent, useState } from "react";
import {
  AdminActionRow,
  AdminCheckbox,
  AdminField,
  AdminHelpText,
  AdminInlineStatus,
  AdminPanel,
  AdminPrimaryButton,
  AdminSelect,
  AdminTextInput
} from "./admin-ui.js";

type TradeSettings = {
  defaultCurrency: string;
  enabledCurrencies: string;
  hsCodeRequired: boolean;
  guestCheckout: boolean;
  taxMode: "manual" | "provider";
  shippingRegion: string;
  paymentPriority: string;
};

const initialSettings: TradeSettings = {
  defaultCurrency: "USD",
  enabledCurrencies: "USD, EUR, GBP, CNY",
  hsCodeRequired: true,
  guestCheckout: true,
  taxMode: "provider",
  shippingRegion: "US / EU / Southeast Asia",
  paymentPriority: "Airwallex, LianLian, PayPal, Stripe"
};

export function TradeSettingsPanel() {
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState("已加载");

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("已保存");
  }

  return (
    <AdminPanel eyebrow="跨境独立站" id="trade-settings-title" status={status} title="外贸站设置">
      <AdminHelpText>预留币种展示、HS Code 要求、税费模式、物流市场和支付通道优先级配置。</AdminHelpText>
      <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={saveSettings}>
        <AdminField label="默认币种">
          <AdminTextInput
            onChange={(event) => setSettings({ ...settings, defaultCurrency: event.target.value })}
            value={settings.defaultCurrency}
          />
        </AdminField>
        <AdminField label="启用币种">
          <AdminTextInput
            onChange={(event) => setSettings({ ...settings, enabledCurrencies: event.target.value })}
            value={settings.enabledCurrencies}
          />
        </AdminField>
        <AdminField label="税费模式">
          <AdminSelect
            onChange={(event) => setSettings({ ...settings, taxMode: event.target.value as TradeSettings["taxMode"] })}
            value={settings.taxMode}
          >
            <option value="provider">服务商 API</option>
            <option value="manual">手动规则</option>
          </AdminSelect>
        </AdminField>
        <AdminField label="物流市场">
          <AdminTextInput
            onChange={(event) => setSettings({ ...settings, shippingRegion: event.target.value })}
            value={settings.shippingRegion}
          />
        </AdminField>
        <AdminField className="lg:col-span-2" label="支付通道优先级">
          <AdminTextInput
            onChange={(event) => setSettings({ ...settings, paymentPriority: event.target.value })}
            value={settings.paymentPriority}
          />
        </AdminField>
        <div className="grid gap-3 lg:col-span-2 sm:grid-cols-2">
          <AdminCheckbox
            checked={settings.hsCodeRequired}
            label="每个 SKU 必须填写 HS Code"
            onChange={(event) => setSettings({ ...settings, hsCodeRequired: event.target.checked })}
          />
          <AdminCheckbox
            checked={settings.guestCheckout}
            label="启用游客结账"
            onChange={(event) => setSettings({ ...settings, guestCheckout: event.target.checked })}
          />
        </div>
        <AdminActionRow className="lg:col-span-2">
          <AdminPrimaryButton type="submit">保存外贸设置</AdminPrimaryButton>
          <AdminInlineStatus>{status}</AdminInlineStatus>
        </AdminActionRow>
      </form>
    </AdminPanel>
  );
}
