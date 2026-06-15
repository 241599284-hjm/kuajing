"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { RegistrationDialog } from "./registration-dialog.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { StorefrontFooter } from "./storefront-footer.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";
import { storefrontCopy, type Locale } from "../lib/storefront-content.js";

type LegalPageKey = "privacy" | "refund" | "terms" | "contact";

type LegalSection = {
  heading: string;
  body: string[];
};

type LegalContent = {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
};

const placeholders = {
  brand: "[BRAND_NAME]",
  domain: "[WEBSITE_DOMAIN]",
  email: "[CONTACT_EMAIL]",
  phone: "[CONTACT_PHONE]",
  address: "[BUSINESS_ADDRESS]",
  updated: "[UPDATED_DATE]",
  currency: "[SETTLEMENT_CURRENCY]"
};

const legalContent: Record<LegalPageKey, Record<Locale, LegalContent>> = {
  privacy: {
    en: {
      eyebrow: "Legal",
      title: "Privacy Policy",
      summary: `${placeholders.brand} explains how customer information is collected, used, protected, and shared when you visit ${placeholders.domain}.`,
      updated: placeholders.updated,
      sections: [
        {
          heading: "Information We Collect",
          body: [
            "We may collect your name, email address, phone number, billing and shipping address, order details, account credentials, customer service messages, device data, IP address, and cookie identifiers.",
            "We only collect information needed to operate the store, process orders, provide customer support, prevent fraud, and improve the shopping experience."
          ]
        },
        {
          heading: "Cookies and Analytics",
          body: [
            "We use cookies to keep your cart active, remember preferences, support account login, measure site performance, and understand product interest.",
            "Where required by law, non-essential cookies are used only after consent. You can adjust browser settings or cookie preferences at any time."
          ]
        },
        {
          heading: "Payments",
          body: [
            `Payments are processed by PayPal. We do not store full card numbers, PayPal credentials, or payment authentication data on ${placeholders.domain}.`,
            "PayPal may process payment information under its own privacy and security terms."
          ]
        },
        {
          heading: "Sharing and Security",
          body: [
            "We may share necessary order information with payment processors, logistics providers, email providers, fraud-prevention tools, analytics providers, and legal authorities when required.",
            "We use administrative, technical, and physical safeguards to protect customer data. No internet service can guarantee absolute security."
          ]
        },
        {
          heading: "Your Rights",
          body: [
            `You may request access, correction, export, or deletion of your personal information by contacting ${placeholders.email}.`,
            "Some order, tax, fraud-prevention, and legal records may be retained where required by applicable law."
          ]
        }
      ]
    },
    zh: {
      eyebrow: "合规",
      title: "隐私政策",
      summary: `${placeholders.brand} 说明客户访问 ${placeholders.domain} 时，个人信息如何被收集、使用、保护和共享。`,
      updated: placeholders.updated,
      sections: [
        { heading: "我们收集的信息", body: ["我们可能收集姓名、邮箱、电话、账单地址、收货地址、订单信息、账户信息、客服消息、设备信息、IP 地址和 Cookie 标识。", "这些信息用于运营商城、处理订单、提供客服、防欺诈和改善购物体验。"] },
        { heading: "Cookie 与统计", body: ["Cookie 用于维持购物车、记住偏好、支持登录、统计性能和了解商品兴趣。", "在法律要求的地区，非必要 Cookie 会在获得同意后使用，用户可随时调整偏好。"] },
        { heading: "支付信息", body: [`支付由 PayPal 处理。${placeholders.domain} 不保存完整银行卡号、PayPal 凭证或支付认证数据。`, "PayPal 会依据其隐私和安全条款处理支付信息。"] },
        { heading: "共享与安全", body: ["我们可能向支付、物流、邮件、风控、统计服务商和法律要求的机构共享必要订单信息。", "我们使用管理、技术和物理措施保护客户数据，但任何互联网服务都无法保证绝对安全。"] },
        { heading: "用户权利", body: [`用户可通过 ${placeholders.email} 申请访问、更正、导出或删除个人信息。`, "订单、税务、风控和法律记录可能按适用法律要求保留。"] }
      ]
    }
  },
  refund: {
    en: {
      eyebrow: "Customer Care",
      title: "Refund and Return Policy",
      summary: `This policy explains returns, exchanges, shipping responsibility, and refund timing for purchases from ${placeholders.domain}.`,
      updated: placeholders.updated,
      sections: [
        { heading: "30-Day Return Window", body: ["You may request a return or exchange within 30 days after delivery. Items must be unused, clean, undamaged, and returned with original packaging where possible."] },
        { heading: "Quality Issues", body: ["If an item arrives damaged, defective, or materially different from the product description, please contact us with photos and your order number.", "For approved quality claims, we will cover reasonable return shipping or offer a replacement, partial refund, or full refund based on the case."] },
        { heading: "Personal Reasons", body: ["For returns due to personal preference, incorrect selection, or change of mind, the customer is responsible for return shipping costs and any non-refundable delivery fees."] },
        { heading: "Non-Returnable Items", body: ["Custom-made products, personalized products, virtual products, digital goods, used items, and items damaged by misuse are not eligible for return or exchange unless required by law."] },
        { heading: "Refund Timing", body: [`Approved refunds are issued to the original payment method in ${placeholders.currency}. PayPal or the issuing bank usually posts refunds within 3-7 business days after processing.`] }
      ]
    },
    zh: {
      eyebrow: "客户服务",
      title: "退款退货政策",
      summary: `本政策说明 ${placeholders.domain} 订单的退换货周期、运费承担和退款到账时效。`,
      updated: placeholders.updated,
      sections: [
        { heading: "30 天退换货周期", body: ["用户可在签收后 30 天内申请退换货。商品需未使用、干净、未损坏，并尽量保留原包装。"] },
        { heading: "质量问题", body: ["如商品破损、瑕疵或与描述明显不符，请提供照片和订单号联系我们。", "审核通过后，我们会承担合理退货运费，或按情况提供换货、部分退款或全额退款。"] },
        { heading: "个人原因", body: ["因个人偏好、选错商品或改变主意产生的退货，退货运费和不可退配送费用由客户承担。"] },
        { heading: "不支持退换的商品", body: ["定制商品、个性化商品、虚拟商品、数字商品、已使用商品和因误用导致损坏的商品不支持退换，法律另有要求除外。"] },
        { heading: "退款到账", body: [`审核通过的退款会按原支付方式以 ${placeholders.currency} 退回。PayPal 或发卡行通常在处理后 3-7 个工作日入账。`] }
      ]
    }
  },
  terms: {
    en: {
      eyebrow: "Terms",
      title: "Terms of Service",
      summary: `These terms govern your access to ${placeholders.domain}, product purchases, and use of ${placeholders.brand} services.`,
      updated: placeholders.updated,
      sections: [
        { heading: "Use of the Website", body: ["You agree to use this website only for lawful personal shopping purposes and not to misuse, attack, scrape, copy, or interfere with the site or its services."] },
        { heading: "Orders and Payment", body: [`Prices are shown in the selected display currency and settled in ${placeholders.currency}. PayPal is the supported payment method unless another method is shown at checkout.`, "An order is accepted only after payment authorization and order confirmation. We may cancel orders affected by inventory errors, payment risk, address risk, or suspected abuse."] },
        { heading: "Product Information", body: ["We try to keep product descriptions, images, prices, stock, and shipping information accurate. Minor differences in color, glaze, texture, handmade finish, or packaging may occur."] },
        { heading: "Intellectual Property", body: [`All website text, images, design, logos, product content, and code are owned by or licensed to ${placeholders.brand}. Unauthorized use is prohibited.`] },
        { heading: "Limitation of Liability", body: ["To the fullest extent permitted by law, we are not liable for indirect, incidental, special, or consequential damages arising from use of the website or products."] },
        { heading: "Governing Law", body: [`These terms are governed by the laws applicable to ${placeholders.address}, unless mandatory consumer protection laws in your country provide otherwise.`] }
      ]
    },
    zh: {
      eyebrow: "条款",
      title: "服务条款",
      summary: `本条款适用于用户访问 ${placeholders.domain}、购买商品和使用 ${placeholders.brand} 服务。`,
      updated: placeholders.updated,
      sections: [
        { heading: "网站使用", body: ["用户同意仅为合法个人购物目的使用网站，不得攻击、抓取、复制、干扰或滥用网站服务。"] },
        { heading: "订单与支付", body: [`价格按所选展示币种显示，并以 ${placeholders.currency} 结算。除结账页另有显示外，支持的支付方式为 PayPal。`, "订单仅在支付授权和订单确认后成立。库存错误、支付风险、地址风险或疑似滥用订单可能被取消。"] },
        { heading: "商品信息", body: ["我们会尽力保持商品描述、图片、价格、库存和配送信息准确。颜色、釉面、纹理、手工痕迹或包装可能存在轻微差异。"] },
        { heading: "知识产权", body: [`网站文字、图片、设计、Logo、商品内容和代码归 ${placeholders.brand} 或授权方所有，禁止未经授权使用。`] },
        { heading: "责任限制", body: ["在法律允许范围内，我们不对因网站或商品使用产生的间接、附带、特殊或后果性损失承担责任。"] },
        { heading: "适用法律", body: [`本条款受 ${placeholders.address} 适用法律管辖，用户所在国家强制消费者保护法律另有规定的除外。`] }
      ]
    }
  },
  contact: {
    en: {
      eyebrow: "Support",
      title: "Contact Us",
      summary: `For order, shipping, payment, return, or product questions, contact ${placeholders.brand} using the information below.`,
      updated: placeholders.updated,
      sections: [
        { heading: "Email", body: [`${placeholders.email}`, "We aim to reply to customer service emails within 1-2 business days."] },
        { heading: "Phone", body: [`${placeholders.phone}`, "Phone availability may vary by region and public holiday schedule."] },
        { heading: "Business Address", body: [placeholders.address] },
        { heading: "Business Hours", body: ["Monday-Friday, 9:00 AM-6:00 PM local business time. Messages received outside business hours will be handled on the next business day."] },
        { heading: "Website", body: [placeholders.domain] }
      ]
    },
    zh: {
      eyebrow: "支持",
      title: "联系我们",
      summary: `如有订单、物流、支付、退换货或商品问题，可通过以下方式联系 ${placeholders.brand}。`,
      updated: placeholders.updated,
      sections: [
        { heading: "邮箱", body: [`${placeholders.email}`, "客服邮件通常会在 1-2 个工作日内回复。"] },
        { heading: "电话", body: [`${placeholders.phone}`, "电话服务时间可能受地区和节假日影响。"] },
        { heading: "经营地址", body: [placeholders.address] },
        { heading: "营业时间", body: ["周一至周五，当地营业时间 9:00-18:00。非营业时间消息会在下一个工作日处理。"] },
        { heading: "网站", body: [placeholders.domain] }
      ]
    }
  }
};

const footerLinks: Array<{ key: LegalPageKey; href: Route }> = [
  { key: "privacy", href: "/privacy-policy" as Route },
  { key: "refund", href: "/refund-return-policy" as Route },
  { key: "terms", href: "/terms-of-service" as Route },
  { key: "contact", href: "/contact-us" as Route }
];

const footerLabels: Record<LegalPageKey, Record<Locale, string>> = {
  privacy: { en: "Privacy Policy", zh: "隐私政策" },
  refund: { en: "Refund and Return Policy", zh: "退款退货政策" },
  terms: { en: "Terms of Service", zh: "服务条款" },
  contact: { en: "Contact Us", zh: "联系我们" }
};

export function LegalPageShell({ pageKey }: { pageKey: LegalPageKey }) {
  const [locale, setLocale] = useStorefrontLocale();
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const copy = storefrontCopy[locale];
  const content = legalContent[pageKey][locale];
  const renderedSections = useMemo(() => content.sections, [content.sections]);

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={setLocale}
        onRegisterClick={() => setRegistrationOpen(true)}
        productsHref="/#products"
        supportHref="/contact-us"
      />
      <section className="premium-container py-14 md:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">{content.eyebrow}</p>
          <h1 className="premium-display mt-4 text-4xl leading-tight md:text-6xl">{content.title}</h1>
          <p className="mt-5 text-sm leading-7 text-[var(--ink-soft)] md:text-base">{content.summary}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            {locale === "zh" ? "更新日期" : "Last updated"}: {content.updated}
          </p>
        </div>

        <div className="mt-12 grid gap-5">
          {renderedSections.map((section) => (
            <section key={section.heading} className="border-t border-[var(--line)] py-7">
              <h2 className="premium-display text-2xl leading-tight md:text-3xl">{section.heading}</h2>
              <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--ink-soft)]">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <nav className="mt-12 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6 text-xs font-bold uppercase tracking-[0.12em]">
          {footerLinks.map((item) => (
            <Link key={item.key} className="premium-focus border-b border-black pb-1" href={item.href}>
              {footerLabels[item.key][locale]}
            </Link>
          ))}
        </nav>
      </section>

      <RegistrationDialog
        copy={copy.registration}
        isOpen={registrationOpen}
        onClose={() => setRegistrationOpen(false)}
      />
      <StorefrontFooter locale={locale} />
    </main>
  );
}
