import "./globals.css";
import type { ReactNode } from "react";
import { CookieConsentHost } from "./components/cookie-consent-host.js";

export const metadata = {
  title: "Demo Teaware Store",
  description: "Crossborder commerce storefront foundation"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CookieConsentHost />
      </body>
    </html>
  );
}

