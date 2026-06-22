import "./globals.css";
import type { ReactNode } from "react";
import { CookieConsentHost } from "./components/cookie-consent-host.js";
import { VisitorAnalytics } from "./components/visitor-analytics.js";

export const metadata = {
  title: "Handmade Jingdezhen Porcelain Tea Sets & Oriental Ceramic Decor",
  description: "Premium hand-painted Chinese teaware, gift porcelain & vases with safe worldwide shipping. Shop handmade tea sets for home & gifts."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <VisitorAnalytics />
        <CookieConsentHost />
      </body>
    </html>
  );
}

