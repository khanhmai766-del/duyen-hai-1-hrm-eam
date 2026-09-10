/** Kiểm tra quy tắc sổ PCT, không kết nối hay ghi cơ sở dữ liệu. */
import assert from "node:assert/strict";
import { parsePermit, permitFilters, parsePermitMembers, permitInstant } from "../lib/server/work-permits";
import { readSessionOpen, validateSessionTime } from "../lib/server/work-permit-sessions";
import { parsePermitPerson } from "../lib/server/work-permit-people";
import { formatPermitNumber, type PermitStatus } from "../lib/work-permits";

const base = {
  workType: "PLANNED", kind: "MECHANICAL", unit: "S1", year: 2026, number: "  pct-001  ", workDate: "2026-09-07",
  content: "Bảo dưỡng bơm", location: "Bơm nước S1", issuerName: "Người cấp", commanderName: "Chỉ huy",
  teamName: "Sửa chữa cơ", workerCount: 3, teamType: "INTERNAL", authorizerName: "Người cho phép",
  issuedAt: "2026-09-07T08:00:00+07:00", authorizedAt: null, closedAt: null,
};
let checked = 0;
function valid(patch: Record<string, unknown>, status: PermitStatus) { checked++; return parsePermit({ ...base, ...patch }, status); }
function invalid(patch: Record<string, unknown>, status: PermitStatus) {
  checked++;
  assert.throws(() => parsePermit({ ...base, ...patch }, status), e => e instanceof Response && e.status === 400);
}
assert.equal(valid({}, "ISSUED").number, "PCT-001");
assert.match(valid({}, "ISSUED").searchText, /bao duong bom/);
valid({ issuedAt: null, commanderName: "", issuerName: "", workerCount: null }, "DRAFT");
invalid({ workType: "KH" }, "ISSUED");
valid({ workType: null }, "ISSUED");
valid({ workType: "UNPLANNED" }, "ISSUED");
valid({ workType: null, issuedAt: null }, "DRAFT");
invalid({ workDate: "2026-02-30" }, "ISSUED");
invalid({ kind: "toString" }, "ISSUED");
invalid({ year: 2025 }, "ISSUED");
invalid({ number: " " }, "ISSUED");
invalid({ workerCount: 1.5 }, "ISSUED");
invalid({ workerCount: 0 }, "ISSUED");
invalid({ issuerName: " " }, "ISSUED");
invalid({ issuedAt: null }, "ISSUED");
invalid({ issuedAt: "2026-09-07T08:00" }, "ISSUED");
invalid({ authorizedAt: "2026-09-07T07:00:00+07:00" }, "ACTIVE");
invalid({ authorizedAt: null }, "ACTIVE");
invalid({ authorizedAt: "2026-09-07T09:00:00+07:00", authorizerName: "" }, "ACTIVE");
valid({ authorizedAt: "2026-09-07T09:00:00+07:00" }, "ACTIVE");
invalid({ authorizedAt: "2026-09-07T09:00:00+07:00", closedAt: "2026-09-07T08:00:00+07:00", result: "Đã xong" }, "CLOSED");
invalid({ authorizedAt: "2026-09-07T09:00:00+07:00", closedAt: "2026-09-07T10:00:00+07:00", result: "" }, "CLOSED");
valid({ authorizedAt: "2026-09-07T09:00:00+07:00", closedAt: "2026-09-07T10:00:00+07:00", result: "Đã xong" }, "CLOSED");
invalid({ authorizedAt: "2026-09-07T09:00:00+07:00", statusReason: "" }, "PAUSED");
invalid({ statusReason: "" }, "CANCELLED");
valid({ statusReason: "Không thực hiện" }, "CANCELLED");
assert.deepEqual(permitFilters(new Request("http://localhost/api/work-permits?kind=ELECTRICAL&q=Nguyễn&teamType=CONTRACTOR")), { kind: "ELECTRICAL", teamType: "CONTRACTOR", OR: [{ searchText: { contains: "nguyen" } }, { sessions: { some: { searchText: { contains: "nguyen" } } } }] });
assert.throws(() => permitFilters(new Request("http://localhost/api/work-permits?from=2026-10-01&to=2026-09-01")), e => e instanceof Response && e.status === 400);
function checkInvalid(fn: () => unknown) {
  checked++;
  assert.throws(fn, e => e instanceof Response && e.status === 400);
}
checkInvalid(() => permitInstant({ at: "2026-09-07T24:00:00+07:00" }, "at"));
checkInvalid(() => parsePermitMembers([{ code: "A01", name: "Người A" }, { code: "a01", name: "Người A" }]));
checkInvalid(() => parsePermitMembers([{ personId: "id-1", code: "A01", name: "Người A" }, { personId: "id-1", code: "B01", name: "Tên khác" }]));
checkInvalid(() => parsePermitMembers([{ name: " " }]));
checkInvalid(() => parsePermitMembers(Array(201).fill({ name: "Nhân viên" })));
checkInvalid(() => parsePermitPerson({ code: "NT 001", name: "CHTT A", company: "Nhà thầu", canCommand: true, isActive: true }));
checkInvalid(() => parsePermitPerson({ code: "NT001", name: "CHTT A", company: "Nhà thầu", canCommand: "true", isActive: true }));
assert.equal(parsePermitPerson({ code: "nt001", name: "CHTT A", company: "Nhà thầu", canCommand: true, isActive: true }).code, "NT001");
const cardPerson = { name: "CHTT A", company: "Nhà thầu", canCommand: true, isActive: true };
assert.equal(parsePermitPerson({ ...cardPerson, code: "1052/nđdh/tatđ".normalize("NFD") }).code, "1052/NĐDH/TATĐ");
assert.equal(parsePermitPerson({ ...cardPerson, code: "AT-2026.001" }).code, "AT-2026.001");
checked += 2;
checkInvalid(() => parsePermitPerson({ ...cardPerson, code: "" }));
checkInvalid(() => parsePermitPerson({ ...cardPerson, code: "A".repeat(81) }));
const openedAt = "2026-09-07T08:00:00+07:00";
checkInvalid(() => readSessionOpen({ openedAt, authorizerName: "Người cho phép", workerCount: 3 }));
checkInvalid(() => readSessionOpen({ openedAt, commanderId: "id-1", workerCount: 3 }));
assert.equal(readSessionOpen({ openedAt, commanderId: "id-1", authorizerName: "Người cho phép" }).workerCount, 1);
const opening = readSessionOpen({ openedAt, commanderId: "id-1", authorizerName: "Người cho phép", workerCount: 99, members: [{ name: "Nhân viên A" }, { name: "Nhân viên B" }] });
assert.equal(opening.workerCount, 3);
assert.equal(valid({ teamType: "CONTRACTOR", workerCount: null, members: [] }, "ISSUED").workerCount, 1);
const lower = new Date(openedAt), now = new Date("2026-09-08T08:00:00+07:00");
checkInvalid(() => validateSessionTime(new Date("2026-09-07T07:59:59+07:00"), lower, now));
checkInvalid(() => validateSessionTime(new Date("2026-09-08T08:00:01+07:00"), lower, now));
validateSessionTime(lower, lower, now);
validateSessionTime(now, lower, now); // Cho phép làm qua ngày, không tự cắt lúc nửa đêm.
valid({ teamType: "CONTRACTOR", authorizedAt: openedAt, statusReason: "" }, "WAITING");
console.log(`Đạt ${checked} tình huống kiểm tra nhập liệu PCT/nhà thầu; chuẩn hóa, danh sách và mốc thời gian hợp lệ.`);

assert.equal(formatPermitNumber({ number: "3831", year: 2026 }), "3831/2026/VH1-NĐDH");
assert.equal(formatPermitNumber({ number: "0031", year: 2027 }), "0031/2027/VH1-NĐDH");
assert.equal(formatPermitNumber({ number: "3831/2026/VH1-NĐDH", year: 2026 }), "3831/2026/VH1-NĐDH");
assert.equal(formatPermitNumber({ number: "PCT-001", year: 2026 }), "PCT-001");
console.log("Đạt 4 kiểm tra định dạng số PCT: ghép năm, giữ số 0 đầu, không lặp hậu tố và giữ mã cũ.");
