import { Suspense } from "react";
import { ResetPasswordShell } from "../components/reset-password-shell.js";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordShell />
    </Suspense>
  );
}
