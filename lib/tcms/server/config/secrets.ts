import "server-only";

import { readFileSync } from "node:fs";

function readSecretFile(path: string, name: string) {
  try {
    const value = readFileSync(path, "utf8").trim();
    if (!value) throw new Error("empty secret file");
    return value;
  } catch (error) {
    throw new Error(`Không thể đọc tệp bí mật ${name}.`, { cause: error });
  }
}

export function requiredSecret(name: string) {
  const filePath = process.env[`${name}_FILE`]?.trim();
  if (filePath) return readSecretFile(filePath, name);

  const directValue = process.env[name]?.trim();
  if (directValue && process.env.NODE_ENV !== "production") return directValue;

  if (directValue) {
    throw new Error(`${name} không được khai báo trực tiếp trong biến môi trường production; hãy dùng ${name}_FILE/Vault.`);
  }
  throw new Error(`Thiếu cấu hình bí mật ${name}_FILE.`);
}

export function optionalSecret(name: string) {
  const filePath = process.env[`${name}_FILE`]?.trim();
  if (filePath) return readSecretFile(filePath, name);
  const directValue = process.env[name]?.trim();
  if (directValue && process.env.NODE_ENV === "production") {
    throw new Error(`${name} không được khai báo trực tiếp trong biến môi trường production; hãy dùng ${name}_FILE/Vault.`);
  }
  return directValue;
}

export function requiredSetting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu cấu hình ${name}.`);
  return value;
}
