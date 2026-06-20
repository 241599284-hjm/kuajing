import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("min-w-0 rounded-lg border border-[var(--border)] bg-white shadow-[var(--shadow-card)]", className)} {...props} />; }
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4", className)} {...props} />; }
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) { return <h2 className={cn("text-base font-medium text-[var(--foreground)]", className)} {...props} />; }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("p-5", className)} {...props} />; }
