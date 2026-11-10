# Ponytail trong dự án Duyên Hải 1

- Nguồn: https://github.com/DietrichGebert/ponytail
- Phiên bản: 5.3.3
- Commit: `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`
- Giấy phép: MIT (tệp `LICENSE` trong mỗi thư mục skill).

Cài đủ sáu skill: `ponytail`, `ponytail-review`, `ponytail-audit`,
`ponytail-debt`, `ponytail-gain`, `ponytail-help`. Các tệp `SKILL.md`
giữ nguyên nội dung upstream. Hướng dẫn của dự án trong `AGENTS.md` vẫn áp dụng.

## Sử dụng

Trong Codex, gọi `$ponytail`, `$ponytail-review`, `$ponytail-audit`,
`$ponytail-debt`, `$ponytail-gain` hoặc `$ponytail-help` từ lượt tiếp theo.
Ví dụ: “Dùng $ponytail-review để rà soát thay đổi chưa commit”.

Đây là bản cài skill theo dự án, không cài plugin hoặc lifecycle hook.
Các hướng dẫn về namespace `$ponytail:…`, tự kích hoạt theo cấu hình,
band/board và cập nhật plugin trong help upstream dành cho bản plugin.

## Đồng bộ

Chỉ sửa bản nguồn ở `.claude/skills/`, sau đó chạy `npm run sync:skills`
để sinh bản cho Codex ở `.agents/skills/`.

Số liệu trong `ponytail-gain` là benchmark upstream, không đo dự án này.
Nguồn benchmark: https://github.com/DietrichGebert/ponytail/blob/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846/benchmarks/results/2026-10-07-agentic.md
