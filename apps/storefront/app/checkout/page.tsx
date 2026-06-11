import { Suspense } from "react";
import { CheckoutShell } from "../components/checkout-shell.js";

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutShell />
    </Suspense>
  );
}
