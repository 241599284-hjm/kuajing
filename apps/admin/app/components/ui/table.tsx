import type { HTMLAttributes, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("max-w-full overflow-x-auto", className)} {...props} />; }
export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) { return <table className={cn("w-full min-w-[760px] border-collapse text-sm", className)} {...props} />; }
export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) { return <th className={cn("sticky top-0 h-10 border-b border-[var(--border)] bg-[#fbfcfd] px-4 text-left text-xs font-medium text-[var(--muted-foreground)]", className)} {...props} />; }
export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) { return <td className={cn("h-12 border-b border-[var(--border)] px-4", className)} {...props} />; }
