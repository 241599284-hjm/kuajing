"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  analyticsAllowed,
  analyticsConsentEvent,
  analyticsConsentStorageKey
} from "../lib/analytics-consent.js";

const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";
const sessionStorageKey = "ferncliff-visitor-session-v1";
type ActivePage = { id: string; path: string; startedAt: number };

function consented() {
  try {
    return analyticsAllowed(window.localStorage.getItem(analyticsConsentStorageKey), navigator.doNotTrack);
  } catch {
    return false;
  }
}

function sessionId() {
  const existing = window.sessionStorage.getItem(sessionStorageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(sessionStorageKey, created);
  return created;
}

function activityBody(page: ActivePage, ended: boolean) {
  return JSON.stringify({
    pageViewId: page.id,
    durationSeconds: Math.max(0, Math.round((Date.now() - page.startedAt) / 1000)),
    ended
  });
}

function sendActivity(session: string, page: ActivePage, ended: boolean) {
  const url = `${apiGatewayUrl}/analytics/sessions/${session}/activity`;
  const body = activityBody(page, ended);
  if (ended && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch(url, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body
  }).catch(() => undefined);
}

export function VisitorAnalytics() {
  const pathname = usePathname();
  const activePage = useRef<ActivePage | null>(null);
  const activeSession = useRef<string | null>(null);

  useEffect(() => {
    function begin() {
      if (!consented() || activePage.current) return;
      const session = sessionId();
      const page = { id: crypto.randomUUID(), path: window.location.pathname + window.location.search, startedAt: Date.now() };
      activeSession.current = session;
      activePage.current = page;
      void fetch(`${apiGatewayUrl}/analytics/sessions/start`, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session,
          pageViewId: page.id,
          path: page.path,
          title: document.title,
          referrer: document.referrer
        })
      }).catch(() => {
        activePage.current = null;
      });
    }
    begin();
    window.addEventListener(analyticsConsentEvent, begin);
    return () => window.removeEventListener(analyticsConsentEvent, begin);
  }, []);

  useEffect(() => {
    if (!consented()) return;
    const session = activeSession.current;
    const previous = activePage.current;
    const path = window.location.pathname + window.location.search;
    if (!session || !previous || previous.path === path) return;
    sendActivity(session, previous, true);
    const page = { id: crypto.randomUUID(), path, startedAt: Date.now() };
    activePage.current = page;
    void fetch(`${apiGatewayUrl}/analytics/sessions/${session}/pages`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageViewId: page.id, path, title: document.title })
    }).catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    const heartbeat = window.setInterval(() => {
      if (activeSession.current && activePage.current && consented()) {
        sendActivity(activeSession.current, activePage.current, false);
      }
    }, 15_000);
    const finish = () => {
      if (activeSession.current && activePage.current && consented()) {
        sendActivity(activeSession.current, activePage.current, true);
      }
    };
    window.addEventListener("pagehide", finish);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", finish);
    };
  }, []);

  return null;
}
