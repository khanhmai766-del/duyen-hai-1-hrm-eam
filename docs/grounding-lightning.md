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
Trong ca và trong 2 giờ sau khi hết ca, ô chọn và nút **Kiểm tra** hiện sẵn khi đủ quyền; không cần mở Sửa bảng. Mặc định danh sách **Chưa xác nhận**, có thể chuyển **Toàn bộ tuyến ca** để xem cả vị trí đã hoàn thành. Các thẻ tổng vẫn tính toàn tuyến ca.

Vị trí hoàn toàn bình thường: chọn từng vị trí hoặc chọn các vị trí bình thường trên trang, rồi bấm **Xác nhận N vị trí bình thường** ở thanh cuối màn hình. Chỉ chọn được vị trí chưa xác nhận; thành công được bỏ chọn/ẩn trong danh sách chờ, lỗi giữ lại để thử tiếp. Đổi ngày/ca/bộ lọc bỏ lựa chọn cũ.

Vị trí có thay đổi hoặc chưa kiểm tra: bấm **Kiểm tra**, ghi đủ kết quả và nội dung khiếm khuyết, bổ sung ảnh nếu cần, rồi **Lưu và xác nhận**. Một thao tác lần lượt lưu kết quả, tải ảnh, tạo lượt xác nhận. Nút lưu luôn hiện dưới hộp thoại, phần nhập cuộn riêng trên điện thoại. Không thể xác nhận khi còn hạng mục Chưa kiểm tra hoặc khiếm khuyết thiếu nội dung. Nếu tải ảnh/ký lỗi sau khi ghi kết quả, giữ hộp thoại và báo rõ kết quả đã lưu nhưng chưa xác nhận; thử lại không tải trùng các ảnh đã thành công trong lần mở này. Đây là các request nối tiếp, không phải giao dịch nguyên tử gồm cả S3.

Sửa/xoá danh mục nằm trong menu **Danh mục** riêng ở thẻ điện thoại hoặc phần chi tiết dòng trên máy tính. Chế độ tổng, ca chưa bắt đầu và ca đã hết hạn xác nhận chỉ xem kết quả, không có ô chọn/nút kiểm tra.

Không đặt lại trạng thái Point hoặc xoá lịch sử vào đầu ngày. Lượt mới dùng `inspectionDate`/`inspectionShift` để xác định ngày/ca, giữ `signedAt` là thời điểm ký thật. Lượt cũ dùng giờ ký; 00:00–05:59 thuộc ca đêm của ngày trước. Khi hết hạn xác nhận, hiển thị kết quả/note trong bản chụp đã ký, không lấy kết quả của ca sau.
Trong thời gian còn cho xác nhận, cần xác nhận lại nếu dữ liệu bị sửa sau lần ký.

Phân công được tính theo danh mục hiện tại, không có bảng lưu phiên bản tuyến hằng ngày. Khi danh mục thay đổi,
các ngày được xem lại dùng phân công hiện tại; lịch sử từng lần kiểm tra vẫn giữ nguyên thời điểm/người/kết quả thực tế.

## Kiểm tra

```bash
npx tsx --test tests/grounding-lightning/*.test.ts
npx tsc --noEmit
MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=tiep-dia-chon-nhieu --widths=360,390,1280
MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=tiep-dia-luu-va-xac-nhan --widths=360,1280
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

## Tách danh mục theo file VH1 (2026)

Danh sách cập nhật có 476 vị trí: Máy nghiền S1 119, S2 126. Mỗi dòng trong file là một vị trí riêng, kể cả tên trùng nhau; giao diện ghi sheet/dòng để phân biệt. Máy nghiền S2 dùng cột F làm tên bộ phận, G làm tình trạng; tên bộ phận không được coi là khiếm khuyết. Hai dòng tiêu đề nhóm ở MN-ND300m3 không phải nhiệm vụ. Dòng chưa ghi kết quả tiếp địa được khởi tạo Chưa kiểm tra.

- Mục còn dùng giữ ID, kết quả hiện tại, ghi chú, ảnh và lượt xác nhận; chỉ bổ sung loại kiểm tra thiếu và sửa tổ máy khi file xác định rõ.
- Mục tổng đã tách và mục ngoài file chuyển `isActive=false`, chỉ xem trong **Mục cũ đã thay thế**. Không xoá dữ liệu hoặc tính vào tuyến ca.
- Yêu cầu triển khai mới nhất: **không đưa phần “Mục cũ đã thay thế” lên giao diện server**. Phần này chỉ hiện khi chạy bản development local; giao diện và API danh sách ARCHIVED bị ẩn/chặn ở production. Yêu cầu này không cho phép xoá lịch sử hoặc ảnh cũ trên server.
- `splitFromId` liên kết vị trí nhỏ với mục tổng. Hộp lịch sử cho xem lịch sử mục tổng riêng; không tính lượt ký mục tổng là lượt ký cho vị trí mới. Lịch sử vẫn theo hạn lưu 1 tháng 15 ngày.
- Khoá nhập gồm cương vị/tổ máy/tên và thứ tự xuất hiện của dòng trùng; chạy lại cùng file không tạo thêm vị trí.
- Theo yêu cầu hiện tại, **chưa nạp ảnh trong file lên localhost**. Khi được yêu cầu triển khai server, nạp ảnh cho vị trí mới theo dòng neo ảnh trong workbook bằng `--apply --import-images`, qua kiểm tra upload và lưu S3. Mặc định script không nhập ảnh; không tự sao chép ảnh mục tổng sang mọi vị trí nhỏ.

Trước khi dùng trên môi trường khác, áp dụng SQL bổ sung cột `prisma/manual/add-grounding-item-split.sql` và sinh Prisma client. Tránh `db:push` toàn schema.

```bash
# Mặc định lập phương án, không ghi. --snapshot <json> đối chiếu bản xuất từ DB khác.
npx tsx scripts/data-ops/update-grounding-catalog.ts --file '/duong-dan/danh-sach.xlsx' --out reports/verify/plan.json
# Sau khi sao lưu, chỉ cập nhật DB local:
npx tsx scripts/data-ops/update-grounding-catalog.ts --file '/duong-dan/danh-sach.xlsx' --apply
```

DB ngoài máy bị chặn mặc định; `--allow-remote` chỉ dùng khi người dùng đã yêu cầu thay đổi dữ liệu trên môi trường đó. Cập nhật được thực hiện trong giao dịch; không ghi nếu danh mục thay đổi từ lúc lập phương án. Không nạp file bằng importer cũ vì importer đó gộp các dòng trùng và không hiểu cấu trúc Máy nghiền S2 mới.

Kiểm tra UI local bằng các preset `tiep-dia-tach-vi-tri-local`, `tiep-dia-muc-cu-local` (không ghi dữ liệu).

## Admin chỉ định ca cho từng khu vực

Admin đang bật chế độ quản trị có thể chọn **Ca sáng / Ca chiều / Ca đêm / Tự chia đều**. Trên điện thoại bấm **Chọn ca kiểm tra** ở thẻ vị trí; trên máy tính mở chi tiết dòng rồi bấm nút này. Khi thêm/sửa danh mục, admin cũng có ô Ca kiểm tra. API chặn mọi vai trò khác gửi `assignedShift`, kể cả giá trị `null` để bỏ chỉ định.

`assignedShift=NULL` là tự động; chỉ định được lưu trên vị trí nên giữ qua ngày và qua cập nhật danh mục từ workbook. Mỗi nhóm cương vị + tổ máy giữ các vị trí cố định ở ca đã chọn, sau đó phân phần tự động để bù vào ca còn ít nhiệm vụ. Khi quá nhiều khu vực bị cố định cùng một ca, số lượng ca có thể chênh lệch; không chuyển các khu vực cố định để ép cân bằng. Mỗi vị trí chỉ được giao đúng một ca.

Đổi ca áp dụng ngay, có thể chia lại phần tự động trong nhóm. Lịch sử/ảnh/kết quả không bị sửa khi chỉ đổi ca; `updatedAt` của vị trí được giữ. Lượt xác nhận chỉ có hiệu lực trong ngày và ca đã ký, nên chuyển sang ca khác cần xác nhận trong ca mới. Máy chủ xác minh tuyến đã tính cả chỉ định khi nhận kết quả, tải/xoá ảnh hoặc xác nhận.

SQL bổ sung: `prisma/manual/add-grounding-assigned-shift.sql` (chỉ thêm cột và ràng buộc giá trị). Đã áp dụng local; chưa triển khai server.

Nạp ảnh có thể chạy lại: bỏ qua vị trí v2 đã có ảnh hoặc được VHV cập nhật; không ghi đè ảnh/kết quả/lượt xác nhận cũ. Ảnh ở dòng chưa có kết quả vẫn được gắn đúng hạng mục, không suy diễn kết quả từ ảnh. Nếu lỗi ảnh sau cập nhật danh mục, chạy lại cùng file và `--import-images` để tiếp tục, không tạo trùng vị trí.


### Hoàn tất kiểm tra sau ca

Cho phép cập nhật kết quả, ảnh và xác nhận tuyến được giao trong ca và thêm 2 giờ sau giờ kết thúc: ca sáng đến 16:00, ca chiều đến 00:00 hôm sau, ca đêm đến 08:00 hôm sau (giờ Việt Nam). Tại mốc hết hạn, API đóng xác nhận. Nút **Ca vừa kết thúc** mở đúng ngày vận hành và ca, kể cả ca đêm của ngày trước.

Lượt mới lưu `inspectionDate` và `inspectionShift` riêng với `signedAt`: kết quả tính cho ca được chọn, thời điểm ký vẫn là thời điểm thật. Lịch sử cũ có hai cột null tiếp tục xác định ca bằng thời điểm ký. Khi triển khai phải áp dụng `prisma/manual/add-grounding-inspection-slot.sql` trước khi nạp dịch vụ mới; không cần đổi dữ liệu lịch sử.
