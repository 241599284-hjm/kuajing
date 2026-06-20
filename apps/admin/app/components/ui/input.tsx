import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn("h-9 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm outline-none placeholder:text-[var(--placeholder)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]", className)} {...props} />; }
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn("min-h-24 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none placeholder:text-[var(--placeholder)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]", className)} {...props} />; }
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm"><span className="font-medium">{label}</span>{children}{hint ? <span className="text-xs text-[var(--muted-foreground)]">{hint}</span> : null}</label>; }
