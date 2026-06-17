"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
import { X } from "lucide-react";
import { FormEvent, useState } from "react";
import type { Locale, storefrontCopy } from "../lib/storefront-content.js";

type RegistrationDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  copy: (typeof storefrontCopy)[Locale]["registration"];
  locale: Locale;
};

const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4102";

export function RegistrationDialog({ isOpen, onClose, copy, locale }: RegistrationDialogProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`${authServiceUrl}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, email, password })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, locale, copy.failed));
      }

      setStatus("sent");
      setMessage(copy.sent);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : copy.failed);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 px-4 pb-4 sm:items-center sm:pb-0">
      <button aria-label={copy.closeBackdrop} className="absolute inset-0" onClick={onClose} type="button" />
      <section className="relative w-full max-w-md rounded-lg bg-white p-5 text-black shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{copy.eyebrow}</p>
            <h2 className="mt-1 text-2xl font-semibold">{copy.title}</h2>
          </div>
          <button
            aria-label={copy.close}
            className="flex size-10 items-center justify-center rounded-full border border-[var(--line)]"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-medium">
            {copy.username}
            <input
              autoComplete="username"
              className="h-11 rounded-md border border-[var(--line)] px-3 outline-none focus:border-black"
              minLength={3}
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {copy.email}
            <input
              autoComplete="email"
              className="h-11 rounded-md border border-[var(--line)] px-3 outline-none focus:border-black"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {copy.password}
            <input
              autoComplete="new-password"
              className="h-11 rounded-md border border-[var(--line)] px-3 outline-none focus:border-black"
              minLength={8}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button
            className="mt-2 h-11 rounded-full bg-black text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/50"
            disabled={status === "submitting"}
            type="submit"
          >
            {status === "submitting" ? copy.sending : copy.submit}
          </button>
        </form>

        {message ? (
          <p className={["mt-4 text-sm leading-6", status === "error" ? "text-red-600" : "text-[var(--ink-soft)]"].join(" ")}>
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
