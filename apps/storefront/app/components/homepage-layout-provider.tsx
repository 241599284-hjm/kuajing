"use client";

import { createDefaultHomepageLayout, type HomepageLayout } from "@commerce/contracts";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";
const adminOrigin = process.env.NEXT_PUBLIC_ADMIN_ORIGIN ?? "http://localhost:3001";
const HomepageLayoutContext = createContext<HomepageLayout>(createDefaultHomepageLayout());

export function HomepageLayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<HomepageLayout>(() => createDefaultHomepageLayout());

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiGatewayUrl}/storefront/homepage`, { signal: controller.signal })
      .then(async (response) => response.ok ? setLayout(await response.json() as HomepageLayout) : undefined)
      .catch(() => undefined);

    function receivePreview(event: MessageEvent) {
      if (event.origin !== adminOrigin) return;
      const message = event.data as { type?: string; layout?: HomepageLayout };
      if (message.type === "homepage-preview" && message.layout?.version === 1) setLayout(message.layout);
    }

    window.addEventListener("message", receivePreview);
    return () => {
      controller.abort();
      window.removeEventListener("message", receivePreview);
    };
  }, []);

  const value = useMemo(() => layout, [layout]);
  return <HomepageLayoutContext.Provider value={value}>{children}</HomepageLayoutContext.Provider>;
}

export function useHomepageLayout() {
  return useContext(HomepageLayoutContext);
}
