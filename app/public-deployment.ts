import { headers } from "next/headers";

export const MAINLAND_PUBLIC_HOST = "huiye-ai.cn";

export async function getPublicRequestContext() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const hostWithPort = (
    forwardedHost?.split(",")[0] ??
    requestHeaders.get("host") ??
    "localhost:4317"
  ).trim();
  const host = hostWithPort.split(":")[0].toLowerCase();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwardedProtocol ??
    (host === "localhost" || host === "127.0.0.1" ? "http" : "https");

  return {
    host,
    origin: `${protocol}://${hostWithPort}`,
    isMainland: host === MAINLAND_PUBLIC_HOST,
  };
}
