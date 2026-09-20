# scripts/

Trước tháng 9/2026 đây là 58 tệp phẳng. Nay chia theo **việc script làm với dữ liệu**,
vì đó là câu hỏi hay gặp nhất khi tìm: "cái này chỉ đọc hay nó ghi vào DB?"

| Thư mục | Làm gì | Chạy được trên production? |
|---|---|---|
| `import/` | Nạp dữ liệu từ Excel/JSON/hệ thống ngoài **vào DB** | Có, nhưng phải chủ đích |
| `check/` | **Chỉ đọc** — kiểm tra, đối chiếu, đo hiệu năng | An toàn |
| `data-ops/` | **Sửa dữ liệu đã có** — chuẩn hoá, gộp, xoá, chuyển kỳ | Nguy hiểm, đọc kỹ trước |
| `build/` | Sinh tệp artifact (mẫu .docx, workflow n8n) — không đụng DB | Không cần |
| `ai/` | Chatbox: nạp tri thức, chạy eval, mock n8n | Tuỳ script |
| `verify/` | Crawl/so sánh trang sau khi sửa giao diện | Chỉ dev |
| `data/` | Tệp dữ liệu đầu vào cho `import/` | — |
| `systemd/` | Unit + timer cài lên server — **đọc `systemd/README.md`**, chúng KHÔNG đi theo `git pull` | — |

## Tệp để ở gốc — có lý do, đừng dời vào thư mục con

| Tệp | Vì sao phải ở gốc |
|---|---|
| `deploy-server.sh` | Lệnh deploy `./scripts/deploy-server.sh` đã ghi trong tài liệu và quen tay |
| `server-disk-guard.sh` | systemd trên server hardcode `/var/www/dh1-app/scripts/server-disk-guard.sh` |
| `run-telegram-job.mjs` | systemd hardcode `/var/www/dh1-app/scripts/run-telegram-job.mjs` |
| `dev.mjs`, `pg.mjs` | Điểm vào của `npm run dev` / `npm run db:start` |
| `push-to-server.mjs`, `codex-start-dev.cmd` | Công cụ triển khai / mở phiên dev |
| `sync-skills.mjs` | `npm run sync:skills` — dựng `.agents/` từ `.claude/` |

**Dời 2 tệp systemd là hỏng timer trên production trong im lặng** — unit đã nằm ở
`/etc/systemd/system`, chúng không đi theo `git pull`. Nếu buộc phải dời thì phải chép lại
unit và chạy `systemctl daemon-reload` trên server.

## Quy ước

- Tên tệp trong thư mục con **không lặp lại tên thư mục**: `import/tbycnn.ts`, không phải
  `import/import-tbycnn.ts`.
- Script chạy thường xuyên thì khai báo trong `package.json` để có tên gọi ngắn.
- Script chạy một lần rồi thôi (backfill, sửa dữ liệu hỏng): xoá sau khi áp dụng xong —
  lịch sử git vẫn giữ. Tháng 9/2026 đã dọn 28 tệp loại này.
