---
name: paddleocr
description: OCR PDF scan hoặc ảnh tài liệu tiếng Việt, nhận diện bố cục và bảng rồi xuất Markdown để nạp cho AI bằng PaddleOCR cục bộ. Dùng khi PDF thiếu lớp văn bản hoặc trích xuất văn bản thông thường cho kết quả kém.
---

# PaddleOCR

Skill này dùng [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) bản `v3.7.0` cùng `PP-StructureV3` để chuyển PDF scan hoặc ảnh tài liệu thành Markdown. Bản clone ở `.upstream/`, Python 3.13 và các gói ở `.python/`, `.bootstrap/`, `.venv/`; các thư mục này chỉ ở máy cục bộ. Nếu chưa có, từ gốc dự án chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/paddleocr/scripts/install.ps1
```

Để xử lý một PDF/ảnh trên Windows:

```powershell
& .claude/skills/paddleocr/.venv/Scripts/python.exe .claude/skills/paddleocr/scripts/parse_document.py <tep.pdf> <thu_muc_output>
```

Script tạo `<ten-tep>.md` và các ảnh được Markdown tham chiếu trong thư mục output. Lần chạy đầu cần kết nối mạng để tải trọng số mô hình vào `%USERPROFILE%\.paddlex\official_models`; các lần sau dùng cache. Mặc định nhận diện tiếng Việt trên CPU; có thể dùng `--lang en` cho tài liệu tiếng Anh. Kết quả tiếng Việt có thể mất dấu và dính từ ngay cả với ảnh rõ; đối chiếu bản gốc, nhất là số liệu và bảng, trước khi nạp AI.

Với PDF đã có lớp văn bản rõ, dùng trích xuất văn bản hiện có trước vì nhanh và nhẹ hơn. Skill này chưa được nối tự động vào các luồng nạp tài liệu của website; chỉ chạy khi được gọi để xử lý tài liệu cụ thể.
