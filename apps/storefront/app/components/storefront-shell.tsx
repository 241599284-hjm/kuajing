"use client";

import { StorefrontCatalogProvider } from "./storefront-catalog-provider.js";
import { HomepageLayoutProvider } from "./homepage-layout-provider.js";
import { FerncliffHomepage } from "./ferncliff-homepage.js";

export function StorefrontShell() {
  return (
    <StorefrontCatalogProvider>
      <HomepageLayoutProvider>
        <FerncliffHomepage />
      </HomepageLayoutProvider>
    </StorefrontCatalogProvider>
  );
}
