import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  const tones = { success: "bg-[var(--success-bg)] text-[var(--success)]", warning: "bg-[var(--warning-bg)] text-[var(--warning)]", danger: "bg-[var(--danger-bg)] text-[var(--danger)]", info: "bg-[var(--info-bg)] text-[var(--info)]", neutral: "bg-[var(--muted)] text-[var(--muted-foreground)]" };
  return <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium", tones[tone], className)} {...props} />;
}
