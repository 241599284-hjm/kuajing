import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

function joinClassNames(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(" ");
}

export function AdminPanel({
  id,
  eyebrow,
  title,
  status,
  children
}: {
  id: string;
  eyebrow: string;
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 rounded-lg border border-[var(--line)] bg-white p-5 sm:p-6" aria-labelledby={id}>
      <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-[var(--ink-soft)]">{eyebrow}</p>
          <h2 id={id} className="text-2xl font-semibold tracking-tight">
            {title}
          </h2>
        </div>
        <AdminStatusBadge>{status}</AdminStatusBadge>
      </div>
      {children}
    </section>
  );
}

export function AdminStatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="w-fit rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink-soft)]">
      {children}
    </span>
  );
}

export function AdminActionRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={joinClassNames("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>{children}</div>;
}

export function AdminPrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={joinClassNames(
        "h-11 rounded-full bg-black px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    />
  );
}

export function AdminSecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={joinClassNames(
        "h-11 rounded-full border border-black px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    />
  );
}

export function AdminToggleButton({
  isActive,
  activeLabel,
  inactiveLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <button
      {...props}
      className={joinClassNames(
        "h-10 rounded-full px-4 text-sm font-semibold",
        isActive ? "bg-black text-white" : "border border-[var(--line)]",
        props.className
      )}
    >
      {isActive ? activeLabel : inactiveLabel}
    </button>
  );
}

export function AdminListCard({
  eyebrow,
  title,
  description,
  action,
  children
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="rounded-md border border-[var(--line)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">{eyebrow}</p>
          <h3 className="mt-1 text-lg font-semibold">{title}</h3>
          {description ? <p className="text-sm text-[var(--ink-soft)]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}

export function AdminField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={joinClassNames("grid gap-2 text-sm font-medium", className)}>
      {label}
      {children}
    </label>
  );
}

export function AdminHelpText({ children }: { children: ReactNode }) {
  return <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{children}</p>;
}

export function AdminCheckbox({
  label,
  containerClassName,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  containerClassName?: string;
}) {
  return (
    <label
      className={joinClassNames(
        "flex min-h-11 items-center gap-3 rounded-md border border-[var(--line)] px-3 text-sm font-medium",
        containerClassName
      )}
    >
      <input {...props} className={joinClassNames("size-4", props.className)} type="checkbox" />
      {label}
    </label>
  );
}

export function AdminTextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={joinClassNames(
        "h-11 rounded-md border border-[var(--line)] px-3 text-base font-normal outline-none focus:border-black",
        props.className
      )}
    />
  );
}

export function AdminNumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <AdminTextInput {...props} type="number" />;
}

export function AdminSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={joinClassNames(
        "h-11 rounded-md border border-[var(--line)] bg-white px-3 text-base font-normal outline-none focus:border-black",
        props.className
      )}
    />
  );
}

export function AdminTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={joinClassNames(
        "min-h-28 rounded-md border border-[var(--line)] px-3 py-2 text-base font-normal outline-none focus:border-black",
        props.className
      )}
    />
  );
}

export function AdminFileInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={joinClassNames(
        "rounded-md border border-[var(--line)] px-3 py-2 text-sm font-normal",
        props.className
      )}
      type="file"
    />
  );
}

export function AdminInlineStatus({ children }: { children: ReactNode }) {
  return (
    <span className="text-sm text-[var(--ink-soft)]" role="status">
      {children}
    </span>
  );
}
