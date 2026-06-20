import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

const buttonVariants = cva("inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      default: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]",
      outline: "border border-[var(--border)] bg-white hover:bg-[var(--muted)]",
      ghost: "hover:bg-[var(--muted)]",
      danger: "bg-[var(--danger)] text-white hover:bg-[#b91c1c]"
    },
    size: { default: "h-9 px-4", sm: "h-8 rounded-md px-3 text-xs", icon: "size-9 p-0" }
  },
  defaultVariants: { variant: "default", size: "default" }
});

export function Button({ className, variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
