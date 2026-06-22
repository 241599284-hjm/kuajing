type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ReleaseOptions = {
  fetchFn?: FetchLike;
  token: string;
  storefrontUrl: string;
  adminUrl: string;
  wait?: (delayMs: number) => Promise<void>;
};

function baseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

async function restart(name: "storefront" | "admin", url: string, token: string, fetchFn: FetchLike) {
  const response = await fetchFn(`${baseUrl(url)}/internal/maintenance/restart`, {
    method: "POST",
    headers: { "x-ops-maintenance-token": token }
  });
  if (!response.ok) throw new Error(`${name} restart failed`);
}

export async function releaseFrontendMemory({
  fetchFn = fetch,
  token,
  storefrontUrl,
  adminUrl,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))
}: ReleaseOptions) {
  if (!token) throw new Error("operations maintenance is not configured");

  await restart("storefront", storefrontUrl, token, fetchFn);
  await wait(1500);

  let storefrontReady = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetchFn(`${baseUrl(storefrontUrl)}/`, { cache: "no-store" });
      if (response.ok) {
        storefrontReady = true;
        break;
      }
    } catch {
      // The container is expected to refuse connections briefly while restarting.
    }
    await wait(1000);
  }
  if (!storefrontReady) throw new Error("storefront did not recover after restart");

  await restart("admin", adminUrl, token, fetchFn);

  return {
    accepted: true,
    restarted: ["storefront", "admin"] as const,
    message: "前台已恢复，后台正在重启。内存指标将在约 10 秒后稳定。"
  };
}
