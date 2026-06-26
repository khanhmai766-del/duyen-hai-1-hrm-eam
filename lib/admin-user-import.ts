import crypto from "crypto";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api";
import { dateFolder, fileExtension, uploadS3Object } from "@/lib/s3-storage";
import type { Role } from "@prisma/client";

type ImportMode = "create" | "update" | "upsert";

type ParsedUserRow = {
  rowNumber: number;
  employeeId: string;
  name: string;
  email: string;
  username: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  role: Role;
  password: string;
  isActive?: boolean;
};

type RowReport = {
  row: number;
  employee_code: string | null;
  email: string | null;
  action: "create" | "update" | "skip";
  status: "success" | "error" | "preview";
  errors: string[];
};

const USER_IMPORT_HEADERS: Record<string, keyof ParsedUserRow | "ignored"> = {
  employee_code: "employeeId",
  employeeid: "employeeId",
  employeecode: "employeeId",
  manhanvien: "employeeId",
  manv: "employeeId",
  "ma nhan vien": "employeeId",
  "ma nv": "employeeId",
  name: "name",
  hoten: "name",
  "ho ten": "name",
  ten: "name",
  email: "email",
  user: "username",
  username: "username",
  tendangnhap: "username",
  "ten dang nhap": "username",
  phone: "phone",
  sodienthoai: "phone",
  sdt: "phone",
  "so dien thoai": "phone",
  position: "position",
  chucvu: "position",
  "chuc vu": "position",
  department: "department",
  phongban: "department",
  "phong ban": "department",
  role: "role",
  vaitro: "role",
  "vai tro": "role",
  password: "password",
  matkhau: "password",
  "mat khau": "password",
  isactive: "isActive",
  trangthai: "isActive",
  "trang thai": "isActive",
};

const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "TECHNICIAN", "VIEWER"];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function roleValue(value: unknown): Role {
  const raw = String(value ?? "VIEWER").trim().toUpperCase();
  return ROLES.includes(raw as Role) ? (raw as Role) : "VIEWER";
}

function boolValue(value: unknown): boolean | undefined {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "yes", "active", "hoạt động", "hoat dong"].includes(raw)) return true;
  if (["0", "false", "no", "inactive", "ngừng", "ngung", "ngừng hoạt động", "ngung hoat dong"].includes(raw)) return false;
  return undefined;
}

function readRows(buffer: Buffer, fileName: string): ParsedUserRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows.map((raw, index) => {
    const mapped: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(raw)) {
      const key = USER_IMPORT_HEADERS[normalizeHeader(header).replace(/\s+/g, "")] ?? USER_IMPORT_HEADERS[normalizeHeader(header)];
      if (key && key !== "ignored") mapped[key] = value;
    }

    return {
      rowNumber: index + 2,
      employeeId: String(mapped.employeeId ?? "").trim(),
      name: String(mapped.name ?? "").trim(),
      email: String(mapped.email ?? "").trim().toLowerCase(),
      username: String(mapped.username ?? "").trim() || null,
      phone: String(mapped.phone ?? "").trim() || null,
      position: String(mapped.position ?? "").trim() || null,
      department: String(mapped.department ?? "").trim() || null,
      role: roleValue(mapped.role),
      password: String(mapped.password ?? "").trim() || "password123",
      isActive: boolValue(mapped.isActive),
    };
  });
}

function validateFile(file: File) {
  const ext = fileExtension(file.name);
  if (!["xlsx", "csv"].includes(ext)) throw new Error("Chỉ chấp nhận tệp .xlsx hoặc .csv");
  const maxMb = Number(process.env.USER_IMPORT_MAX_FILE_MB ?? 5);
  if (file.size > maxMb * 1024 * 1024) throw new Error(`Tệp import vượt quá ${maxMb}MB`);
  return ext;
}

function validateRow(row: ParsedUserRow, mode: ImportMode) {
  const errors: string[] = [];
  if (!row.employeeId) errors.push("Thiếu mã nhân viên");
  if ((mode === "create" || mode === "upsert") && !row.name) errors.push("Thiếu họ tên");
  if ((mode === "create" || mode === "upsert") && !row.email) errors.push("Thiếu email");
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("Email không hợp lệ");
  return errors;
}

export function createUserImportTemplate(format: "xlsx" | "csv") {
  const rows = [
    {
      "Mã nhân viên": "NV001",
      "Họ tên": "Nguyễn Văn A",
      "Email": "nva@duyenhai1.vn",
      "Số điện thoại": "0900000000",
      "Chức vụ": "Kỹ thuật viên",
      "Bộ phận": "Vận hành 1",
      "Vai trò": "TECHNICIAN",
      "User": "nva",
      "Mật khẩu": "password123",
      "Trạng thái": "Hoạt động",
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "users");
  if (format === "csv") return Buffer.from(XLSX.utils.sheet_to_csv(sheet), "utf8");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export async function importUsersFromForm(form: FormData, actorId: string) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp import");
  const ext = validateFile(file);

  const mode = String(form.get("mode") ?? "upsert") as ImportMode;
  if (!["create", "update", "upsert"].includes(mode)) throw new Error("Chế độ import không hợp lệ");
  const preview = String(form.get("preview") ?? "false") === "true";

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = readRows(buffer, file.name);
  if (!rows.length) throw new Error("Không có dòng dữ liệu hợp lệ trong tệp");

  const employeeIds = rows.map((r) => r.employeeId).filter(Boolean);
  const emails = rows.map((r) => r.email).filter(Boolean);
  const usernames = rows.map((r) => r.username).filter((v): v is string => !!v);
  const duplicateCodes = new Set(employeeIds.filter((v, i) => employeeIds.indexOf(v) !== i));
  const duplicateEmails = new Set(emails.filter((v, i) => emails.indexOf(v) !== i));
  const duplicateUsernames = new Set(usernames.filter((v, i) => usernames.indexOf(v) !== i));

  const existingUsers = await prisma.user.findMany({
    where: { OR: [{ employeeId: { in: employeeIds } }, { email: { in: emails } }, { username: { in: usernames } }] },
    select: { id: true, employeeId: true, email: true, username: true },
  });
  const byEmployeeId = new Map(existingUsers.map((u) => [u.employeeId, u]));
  const byEmail = new Map(existingUsers.map((u) => [u.email, u]));
  const byUsername = new Map(existingUsers.filter((u) => u.username).map((u) => [u.username!, u]));

  let importKey: string | null = null;
  if (!preview) {
    importKey = `imports/${dateFolder()}/${crypto.randomUUID()}.${ext}`;
    await uploadS3Object({
      key: importKey,
      body: buffer,
      contentType: ext === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      originalName: file.name,
    });
  }

  const reports: RowReport[] = [];
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const errors = validateRow(row, mode);
    if (duplicateCodes.has(row.employeeId)) errors.push("Mã nhân viên bị trùng trong tệp");
    if (row.email && duplicateEmails.has(row.email)) errors.push("Email bị trùng trong tệp");
    if (row.username && duplicateUsernames.has(row.username)) errors.push("User bị trùng trong tệp");

    const existing = row.employeeId ? byEmployeeId.get(row.employeeId) : null;
    const emailOwner = row.email ? byEmail.get(row.email) : null;
    const usernameOwner = row.username ? byUsername.get(row.username) : null;
    if (emailOwner && emailOwner.employeeId !== row.employeeId) errors.push("Email đã thuộc mã nhân viên khác");
    if (usernameOwner && usernameOwner.employeeId !== row.employeeId) errors.push("User đã thuộc mã nhân viên khác");
    if (mode === "create" && existing) errors.push("Mã nhân viên đã tồn tại");
    if (mode === "update" && !existing) errors.push("Mã nhân viên chưa tồn tại");

    const action = existing ? "update" : mode === "update" ? "skip" : "create";
    if (errors.length || preview) {
      reports.push({
        row: row.rowNumber,
        employee_code: row.employeeId || null,
        email: row.email || null,
        action,
        status: errors.length ? "error" : "preview",
        errors,
      });
      continue;
    }

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(row.name ? { name: row.name } : {}),
          ...(row.email ? { email: row.email } : {}),
          username: row.username,
          phone: row.phone,
          position: row.position,
          department: row.department,
          role: row.role,
          ...(row.isActive !== undefined ? { isActive: row.isActive } : {}),
        },
      });
      updated++;
    } else {
      const createdUser = await prisma.user.create({
        data: {
          employeeId: row.employeeId,
          name: row.name,
          email: row.email,
          username: row.username,
          phone: row.phone,
          position: row.position,
          department: row.department,
          role: row.role,
          passwordHash: await bcrypt.hash(row.password, 10),
          ...(row.isActive !== undefined ? { isActive: row.isActive } : {}),
        },
      });
      byEmployeeId.set(createdUser.employeeId, createdUser);
      byEmail.set(createdUser.email, createdUser);
      if (createdUser.username) byUsername.set(createdUser.username, createdUser);
      created++;
    }

    reports.push({
      row: row.rowNumber,
      employee_code: row.employeeId,
      email: row.email || null,
      action,
      status: "success",
      errors: [],
    });
  }

  const errorCount = reports.filter((r) => r.status === "error").length;
  await audit(
    actorId,
    preview ? "PREVIEW_IMPORT_USERS" : "IMPORT_USERS",
    "User",
    importKey ?? undefined,
    JSON.stringify({ mode, total: rows.length, created, updated, errorCount, importKey }).slice(0, 6000)
  );

  return {
    preview,
    mode,
    import_key: importKey,
    total_rows: rows.length,
    success_rows: reports.filter((r) => r.status === "success").length,
    error_rows: errorCount,
    created,
    updated,
    rows: reports,
  };
}
