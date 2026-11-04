export const REQUIRED_QLKT_EXTENSION_VERSION = "0.4.41";
export const QLKT_EXTENSION_DOWNLOAD_URL = `/ctktkt/qlkt-sync-extension.zip?v=${REQUIRED_QLKT_EXTENSION_VERSION}`;

function versionParts(version: string) {
  const parts = version.trim().split(".").map(Number);
  return parts.length >= 3 && parts.every(Number.isFinite) ? parts : null;
}

export function isQlktExtensionOutdated(version: string) {
  const current = versionParts(version);
  const required = versionParts(REQUIRED_QLKT_EXTENSION_VERSION);
  if (!version.trim()) return false;
  if (!current || !required) return true;
  const length = Math.max(current.length, required.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (current[index] || 0) - (required[index] || 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}
