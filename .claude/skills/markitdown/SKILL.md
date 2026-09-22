---
name: markitdown
description: Chuyển PDF, Word, PowerPoint, Excel và các tệp khác thành Markdown để đọc, tìm kiếm hoặc phân tích nội dung bằng MarkItDown của Microsoft. Dùng khi cần trích xuất cấu trúc và văn bản; không dùng để tạo tài liệu có bố cục trình bày chính xác.
---

# MarkItDown

Skill này dùng [microsoft/markitdown](https://github.com/microsoft/markitdown) để chuyển tài liệu thành Markdown. Mã nguồn được clone vào `.upstream/`; công cụ chạy trong `.venv/` riêng của skill. Hai thư mục này chỉ ở máy cục bộ. Nếu chưa có, chạy `powershell -ExecutionPolicy Bypass -File .claude/skills/markitdown/scripts/install.ps1` từ gốc dự án.

Trên Windows, gọi `.claude/skills/markitdown/.venv/Scripts/markitdown.exe <duong-dan-tep> -o <duong-dan-output.md>`. Có thể bỏ `-o` để lấy Markdown từ stdout. Đặt output theo vị trí người dùng yêu cầu; nếu chỉ cần đọc tạm, dùng thư mục tạm hoặc `tmp/` của dự án.

MarkItDown ưu tiên giữ tiêu đề, danh sách, bảng và liên kết để phân tích nội dung. Với tác vụ cần giữ nguyên bố cục, chỉnh sửa hoặc xuất bản tài liệu, dùng công cụ chuyên biệt cho định dạng đó. Chỉ đưa vào công cụ những nguồn mà tác vụ cho phép đọc; MarkItDown truy cập tệp hoặc URL bằng quyền của tiến trình hiện tại.
