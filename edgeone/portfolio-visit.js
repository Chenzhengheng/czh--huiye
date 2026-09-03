(() => {
  if (window.location.hostname !== "huiye-ai.cn") return;

  const recordVisit = () => {
    fetch("/api/portfolio-visits/visit", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", recordVisit, { once: true });
  } else {
    recordVisit();
  }
})();
