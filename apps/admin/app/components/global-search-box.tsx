"use client";

import { Package, Search, ShoppingCart, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { globalSearchSelection, type GlobalSearchResult } from "../lib/global-search.js";
import { createRequestId } from "../lib/request-id.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

const resultMeta = {
  order: { label: "订单", icon: ShoppingCart },
  product: { label: "商品", icon: Package },
  customer: { label: "客户", icon: Users }
} as const;

export function GlobalSearchBox({ onSelect }: { onSelect: (selection: ReturnType<typeof globalSearchSelection>) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [status, setStatus] = useState("输入至少 2 个字符");
  const [loading, setLoading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    setActiveIndex(-1);
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      setStatus("输入至少 2 个字符");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setStatus("正在搜索");
      void fetch(`${adminGatewayUrl}/search?q=${encodeURIComponent(normalized)}&limit=15`, {
        cache: "no-store",
        credentials: "include",
        headers: { "x-correlation-id": createRequestId() },
        signal: controller.signal
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { items?: GlobalSearchResult[]; message?: string };
        if (!response.ok || !Array.isArray(payload.items)) throw new Error(payload.message ?? "全局搜索暂不可用");
        setResults(payload.items);
        setStatus(payload.items.length ? `找到 ${payload.items.length} 条结果` : "没有匹配结果");
      }).catch((error) => {
        if (!controller.signal.aborted) {
          setResults([]);
          setStatus(error instanceof Error ? error.message : "全局搜索暂不可用");
        }
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(result: GlobalSearchResult) {
    onSelect(globalSearchSelection(result));
    setQuery("");
    setResults([]);
    setMobileOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      setMobileOpen(false);
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => current <= 0 ? results.length - 1 : current - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  }

  function resultsPanel() {
    if (!query.trim()) return null;
    return <div className="absolute left-0 right-0 top-11 z-[80] max-h-[min(420px,70vh)] overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-2 shadow-xl" role="listbox">
      {results.map((result, index) => {
        const { icon: Icon, label } = resultMeta[result.type];
        return <button aria-selected={index === activeIndex} className={`flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left ${index === activeIndex ? "bg-[var(--muted)]" : "hover:bg-[var(--muted)]"}`} key={`${result.type}-${result.id}`} onClick={() => choose(result)} role="option">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--info-bg)] text-[var(--info)]"><Icon size={16}/></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{result.title}</span><span className="block truncate text-xs text-[var(--muted-foreground)]">{result.subtitle}</span></span>
          <span className="max-w-40 shrink-0 truncate text-right text-xs text-[var(--muted-foreground)]"><span className="block">{label}</span><span className="block truncate">{result.meta}</span></span>
        </button>;
      })}
      {!results.length ? <p className="px-3 py-5 text-center text-xs text-[var(--muted-foreground)]">{loading ? "正在搜索" : status}</p> : <p className="px-3 pb-1 pt-2 text-xs text-[var(--muted-foreground)]">{status}</p>}
    </div>;
  }

  const searchInput = <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--placeholder)]" size={16}/><Input aria-autocomplete="list" aria-expanded={Boolean(query.trim())} aria-label="全局搜索" className="pl-9 pr-9" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder="搜索订单号、PayPal 交易 ID、商品名称、买家邮箱"/>{query ? <Button aria-label="清空搜索" className="absolute right-1 top-1/2 -translate-y-1/2" size="icon" variant="ghost" onClick={() => setQuery("")}><X size={15}/></Button> : null}{resultsPanel()}</div>;

  return <>
    <div className="mx-auto hidden w-full max-w-xl px-6 lg:block">{searchInput}</div>
    <Button aria-label={mobileOpen ? "关闭全局搜索" : "打开全局搜索"} className="ml-auto min-h-11 min-w-11 lg:hidden" size="icon" variant="ghost" onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? <X size={18}/> : <Search size={18}/>}</Button>
    {mobileOpen ? <div className="fixed inset-x-0 top-12 z-[75] border-b border-[var(--border)] bg-white p-3 shadow-lg lg:hidden">{searchInput}</div> : null}
  </>;
}
