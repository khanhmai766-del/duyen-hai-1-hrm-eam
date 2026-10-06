# Tiếp địa & chống sét — kiểm tra hằng ngày theo ca

Mỗi cương vị **và tổ máy** được chia thành ba tuyến cố định, theo thứ tự khu vực trong danh mục:

| Ca | Giờ Việt Nam |
| --- | --- |
| Sáng | 06:00–14:00 |
| Chiều | 14:00–22:00 |
| Đêm | 22:00–06:00 hôm sau |

- Từ 3 khu vực trở lên: mỗi khu vực thuộc một ca; số khu vực giữa các ca chênh tối đa một. Ví dụ 10 khu vực → 4/3/3.
- Có 2 khu vực: sáng kiểm tra khu vực đầu, chiều khu vực sau; ca đêm không có nhiệm vụ.
- Có 1 khu vực: giao ca sáng; ca chiều và đêm không có nhiệm vụ. Mỗi khu vực chỉ được giao một lần trong ngày.
- Tìm kiếm, lọc kết quả, sắp xếp bảng và phân trang không thay đổi tuyến được giao.
- Thêm, đổi cương vị/tổ máy/tên hoặc xoá khu vực làm chia lại nhóm tương ứng theo danh mục mới.

Trang tự mở ca hiện tại và tải lại mỗi 30 giây. Có thể chọn ngày và ca để xem số khu vực đã/chưa xác nhận.
Nút **Tất cả thiết bị** hiển thị toàn danh mục trong phạm vi quyền, không giới hạn tuyến ca. Các thẻ tổng số/bình thường/khiếm khuyết và bộ lọc dùng kết quả hiện tại, không lấy bản chụp cũ đã ký. Tiến độ chờ xác nhận vẫn tính theo ca được giao trong ngày hiện tại. Chế độ tổng chỉ xem; chọn ca hiện tại để kiểm tra và xác nhận.

Chỉ ca đang diễn ra được cập nhật kết quả, ảnh và xác nhận; máy chủ kiểm tra cả thời gian và tuyến được giao.
Khi chuyển ca hoặc ngày, các lựa chọn xác nhận đang mở được bỏ để tránh xác nhận nhầm.

Mỗi khu vực phải được xác nhận trong ca được giao, kể cả kết quả vẫn bình thường. Lượt xác nhận của hôm trước không hoàn thành ngày hiện tại. Ca không được giao khu vực thì không phải kiểm tra; cả ngày hoàn thành khi đã xác nhận đủ danh mục.
Giữ chức năng chọn nhiều khu vực bình thường, xử lý khiếm khuyết riêng. Các khu vực vừa sửa được xác nhận khi bấm Lưu.

Không đặt lại trạng thái Point hoặc xoá lịch sử vào đầu ngày. Dùng `signedAt` của Inspection để xác định ngày/ca;
00:00–05:59 thuộc ca đêm của ngày trước. Ca đã kết thúc hiển thị kết quả/note trong bản chụp đã ký, không lấy kết quả của ca sau.
Xác nhận trong ca hiện tại cần thực hiện lại nếu dữ liệu bị sửa sau lần ký.

Phân công được tính theo danh mục hiện tại, không có bảng lưu phiên bản tuyến hằng ngày. Khi danh mục thay đổi,
các ngày được xem lại dùng phân công hiện tại; lịch sử từng lần kiểm tra vẫn giữ nguyên thời điểm/người/kết quả thực tế.

## Kiểm tra

```bash
npx tsx --test tests/grounding-lightning/*.test.ts
npx tsc --noEmit
MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=tiep-dia-chon-nhieu --widths=360,390,1280
MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=tiep-dia-ba-ca-du-lieu-local --widths=360,1280
```

Preset đầu giả lập cả lượt ghi trong trình duyệt; preset sau chỉ đọc API thật trên DB local.
Không cần đổi schema hoặc chạy SQL để dùng tính năng này.

## Giữ lịch sử trong 1 tháng 15 ngày

Giữ một tháng lịch cộng thêm 15 ngày lùi từ **ngày vận hành hiện tại**, theo giờ Việt Nam. Ví dụ ngày 06/10 giữ từ 22/08 lúc 06h; ngày 31/03 giữ từ 13/02 (14/02 năm nhuận). Trước 06h vẫn tính ngày vận hành hôm trước, không cắt đôi ca đêm.

Khi người có quyền mở danh sách hoặc lịch sử, tự dọn tối đa mỗi giờ: xoá lượt xác nhận quá hạn, kết quả chụp của lượt đó (FK Cascade), cùng AuditLog/SystemAuditLog riêng cho tiếp địa/chống sét quá hạn. Bản production chưa có SystemAuditLog vẫn hoạt động. Lỗi dọn được ghi log; API lịch sử vẫn giới hạn trong 1 tháng 15 ngày gần nhất. Không dọn danh mục, Point hiện tại, ảnh S3 hoặc nhật ký của các phần khác.

Không có người truy cập thì việc xoá vật lý chờ tới lần mở tiếp theo. Bản sao lưu DB vẫn theo chính sách sao lưu chung của server, không thay đổi trong yêu cầu này.

Kiểm tra trước khi dọn thủ công (mặc định chỉ đọc):

```bash
npx tsx scripts/data-ops/grounding-retention.ts --dry-run
# Thực sự xoá lịch sử quá hạn, chỉ chạy khi đã được yêu cầu:
npx tsx scripts/data-ops/grounding-retention.ts --apply
```
