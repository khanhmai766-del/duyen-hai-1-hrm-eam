/** Các API có bearer riêng; không dùng cookie hoặc phiên đăng nhập người dùng. */
export function isCtktktMachineEndpoint(pathname: string, method: string) {
  if (method === "GET") return [
    "/api/ctktkt/integration/v1/operating-data",
    "/api/ctktkt/cron/coal-photos",
    "/api/ctktkt/google-mirror/snapshot",
  ].includes(pathname);
  return method === "POST" && pathname === "/api/ctktkt/google-mirror/status";
}
