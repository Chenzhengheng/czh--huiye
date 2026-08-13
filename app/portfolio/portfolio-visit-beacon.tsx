"use client";

import { useEffect } from "react";

export function PortfolioVisitBeacon() {
  useEffect(() => {
    if (window.location.pathname !== "/portfolio") return;
    const endpoint = "/api/portfolio-visits/confirm";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([], { type: "text/plain" }));
      return;
    }
    void fetch(endpoint, { method: "POST", credentials: "same-origin", keepalive: true });
  }, []);
  return null;
}
