import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { isKtktServerFault, rethrowKtktServerFault } from "../../../modules/ctktkt/server/server-fault.ts";

const prismaKnown = new Prisma.PrismaClientKnownRequestError("Invalid `prisma.ctktktShiftReadings.upsert()` invocation", { code: "P2002", clientVersion: "test" });
const prismaInit = new Prisma.PrismaClientInitializationError("Can't reach database server at `localhost:5433`", "test");
const netError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5433"), { code: "ECONNREFUSED" });

test("lỗi Prisma, lỗi hệ thống Node và fetch hỏng mạng là lỗi máy chủ", () => {
  for (const error of [prismaKnown, prismaInit, netError, new TypeError("fetch failed")]) assert.equal(isKtktServerFault(error), true, String(error));
  assert.throws(() => rethrowKtktServerFault(prismaKnown), err => err === prismaKnown);
});

test("câu báo lỗi dữ liệu do code tự ném vẫn trả cho người dùng như cũ", () => {
  for (const error of [new Error("Ô T12 phải là số."), new SyntaxError("Unexpected token"), new TypeError("Cannot read properties of null"), Object.assign(new Error("x"), { code: "P2002" }), null, "chuỗi"]) {
    assert.equal(isKtktServerFault(error), false, String(error));
    assert.doesNotThrow(() => rethrowKtktServerFault(error));
  }
});
