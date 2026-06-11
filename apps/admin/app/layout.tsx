import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Commerce Admin",
  description: "Merchant operations console"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

