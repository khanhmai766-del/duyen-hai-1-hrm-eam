---
name: docx-print-html
description: Duy trì bản HTML xem và in của phiếu công tác từ mẫu Word gốc, điền dữ liệu động và kiểm tra bố cục in theo DOCX. Dùng khi sửa biểu mẫu phiếu công tác hoặc luồng xuất tài liệu của nó.
---

# HTML in phiếu công tác

Hai mẫu Word `templates/work-permit-electrical.docx` và `templates/work-permit-mechanical.docx` là nguồn tham chiếu. Bản HTML tương ứng nằm tại `templates/html/work-permit-electrical.html` và `templates/html/work-permit-mechanical.html`. Sinh lại bằng:

```powershell
& .claude/skills/markitdown/.venv/Scripts/python.exe scripts/build/docx-to-print-html.py
```

MarkItDown giúp kiểm nội dung và thứ tự văn bản; PaddleOCR chỉ cần khi tài liệu nguồn là bản scan. Cả hai không bảo đảm bố cục in. Đọc kích thước giấy, lề, bảng, ngắt trang và kiểu chữ từ DOCX, rồi chỉnh HTML/CSS theo bản in gốc.

Sau khi thay mẫu Word hoặc mã điền dữ liệu, xuất DOCX ra PDF bằng Word và in HTML bằng trình duyệt đích. So từng trang về số trang, khổ giấy, vị trí bảng, chữ ký và phần tràn trang. Kiểm cả phiếu đã điền dữ liệu đại diện, gồm nhiều dòng nhân sự và đoạn dài. Không kết luận hai bản giống hoàn toàn khi chưa đối chiếu hình ảnh.

Dữ liệu động trong HTML phải dùng cùng phép tính với bản Word và phải thoát ký tự HTML của dữ liệu người dùng. Giữ mẫu Word để xuất file Word và làm chuẩn tham chiếu cho bản HTML.
