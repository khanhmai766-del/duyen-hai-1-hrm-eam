# Rà soát và tối ưu tải dữ liệu sổ PCT — 10/09/2026

Phạm vi đo: DB local, không phải benchmark production. Sau rà soát người dùng đã yêu cầu thực hiện tối ưu.

## Kết quả sau tối ưu

- Danh sách 3 PCT: 3.441 → 1.426 byte (giảm khoảng 59%).
- Phiếu có 4 lần làm việc/7 cập nhật: lần tải đầu 27.559 → 2.598 byte (giảm khoảng 91%).
- Cùng dữ liệu local, đo JSON UTF-8 trước nén và không tính envelope HTTP.
- List chỉ lấy trường hiển thị; 10 phiếu/trang. Detail chỉ 2 phiên + 2 tiêu đề lịch sử và tổng; tải thêm theo trang 10, nội dung thay đổi tải riêng khi mở. Truy vấn lịch sử kiểm tra phiên bản, không ghép trang bị thay đổi.
- Picker nhân sự dùng truy vấn SQL 20 người/trang, tìm tiếng Việt không dấu ở server và chỉ 5 trường cần thiết. Form nhà thầu không tải useUsers toàn bộ.
- Danh bạ bỏ truy vấn CHTT trùng, chỉ select trường dùng; polling 30 giây chỉ trong picker. Các lần đang mở có liên quan vẫn truy vấn để cảnh báo chính xác.
- Companies dùng DISTINCT tại SQL và cache client ngắn.
- Excel select các cột ghi sổ, chỉ một sheet, bỏ Trạng thái. Cho chọn xuất toàn bộ sổ theo năm cấp số hoặc theo bộ lọc đang xem. Giới hạn 10.000 vẫn giữ để bảo vệ bộ nhớ.
- 233 kiểm tra tích hợp đạt; lint các file thay đổi đạt. Type-check có lỗi ở TBYCNN ngoài phạm vi.

Phần dưới ghi nhận hiện trạng trước tối ưu để đối chiếu. Những mục như cache thống kê, index tìm kiếm, streaming Excel và chuẩn hóa quan hệ nhân sự–phiên vẫn cần đo trên quy mô thực tế; chưa thêm schema/index cho các mục này.

## Số liệu hiện tại

DB local có 3 PCT, 5 lần làm việc, 11 bản ghi lịch sử, 6 nhân sự nhà thầu, 164 tài khoản website, 1 lần đang mở. Không đọc/xuất thông tin cá nhân trong báo cáo.

Dung lượng JSON tính bằng UTF-8 từ kết quả Prisma, chưa tính HTTP envelope/nén:

- Danh sách 3 PCT Cơ: 3.441 byte.
- Phiếu lớn nhất trong danh sách: 27.559 byte, gồm 4 lần làm việc và 7 cập nhật.
- Riêng lịch sử phiếu này: 22.928 byte (khoảng 83%).

Dữ liệu mẫu hiện còn nhẹ; các số liệu này không chứng minh tốc độ khi có hàng nghìn phiếu.

## Điểm đã có giới hạn

- `app/api/work-permits/route.ts`: phân trang DB 10 phiếu; chỉ kèm tối đa một lần đang mở mỗi phiếu. Không tải toàn bộ sổ để chia trang trên trình duyệt.
- `app/api/work-permits/people/route.ts`: danh bạ 25 người/trang. Thông tin công tác được truy vấn theo nhóm người trên trang, không gọi một request cho từng người.
- Tìm kiếm danh bạ và sổ debounce 300 ms.
- `hooks/useUsers.ts`: dữ liệu summary cache phía client 5 phút; server cache 60 giây và dùng chung request đang chạy. Summary không kèm chữ ký/base64 ảnh.
- DB có index loại/ngày, trạng thái/ngày, lịch sử theo PCT/thời điểm, phiên theo PCT/CHTT/thời điểm; partial unique index cho phiên đang mở.
- Excel chỉ tải khi bấm xuất, chỉ một sheet, giới hạn 10.000 PCT và không kèm quan hệ sessions.

## Các điểm phát hiện trước tối ưu

1. **Ưu tiên cao — chi tiết tải toàn bộ lịch sử.** `app/api/work-permits/[id]/route.ts` include tất cả sessions/history, không take. Hai mục gần nhất chỉ là slice ở UI. Nhấn Xem thêm không tải thêm từ server vì dữ liệu đã được tải hết. Cập nhật/mở/kết thúc/bàn giao sẽ invalidate rồi tải lại toàn bộ chi tiết đang mở.
   - Đề xuất: response đầu chỉ 2 mục và tổng số, endpoint phân trang riêng cho từng danh sách. Phần nội dung before/after chỉ tải khi mở một cập nhật.
2. **Ưu tiên cao — danh sách chính trả trường không cần thiết.** Trả mọi trường PCT cùng mọi trường phiên đang mở: members, ghi chú dài, searchText… trong khi bảng chỉ cần thông tin tóm tắt. Nút sửa hiện dùng dữ liệu từ chi tiết nên có thể tách kiểu list summary riêng.
   - Đề xuất: select tối thiểu, không trả danh sách nhân viên/nội dung dài không hiển thị trên bảng.
3. **Ưu tiên vừa — picker nhân sự website tải tất cả tài khoản summary.** Tìm kiếm/phân trang 20 người ở UI không phải phân trang server. Form cấp phiếu cũng gọi useUsers cho datalist. 164 tài khoản hiện tại còn nhỏ; summary vẫn chứa nhiều trường picker không sử dụng.
   - Đề xuất: endpoint tên/mã/chức vụ/đơn vị/hoạt động, tìm kiếm và phân trang phía server.
4. **Ưu tiên vừa — danh bạ nhà thầu tự tải lại 15 giây.** Mỗi lần có count, truy vấn người và công tác đang mở; phần công tác xét JSON members theo tối đa 25 người. ActiveWorks chưa có giới hạn theo số phiên của một nhân viên. Thông tin CHTT được lấy cả ở relation sessions và activeSessions để tương thích activeWork.
   - Đề xuất: chỉ polling khi thực sự cần trạng thái công tác; bỏ truy vấn trùng sau khi chuyển hết nơi dùng; khi dữ liệu lớn cân nhắc bảng liên kết nhân sự–phiên để thay tìm JSON. Không giảm kiểm tra xung đột lúc ghi.
5. **Ưu tiên thấp — tên nhà thầu tải toàn bộ danh sách tên không phân trang.** Endpoint companies lấy tên distinct từ danh bạ. Không tải hồ sơ đầy đủ nhưng vẫn tăng theo quy mô danh bạ.
6. **Xuất Excel có thể nặng ở ngưỡng 10.000 phiếu.** Đọc đầy đủ các trường rồi tạo workbook và buffer trong RAM. Giới hạn số phiếu không giới hạn tổng byte do trường nội dung/members có độ dài khác nhau.
   - Đề xuất: select cột cần xuất, khuyến khích lọc ngày; cân nhắc streaming khi có dữ liệu đủ lớn.
7. **Tìm kiếm và thống kê.** Sổ dùng contains, OR cả nội dung phiên; index hiện tại chưa có chỉ mục chuyên cho tìm chuỗi/JSON. Mỗi lần đổi trang chạy lại count/groupBy theo bộ lọc.
   - Đề xuất: đo EXPLAIN trên dữ liệu đủ lớn trước khi thêm index, cân nhắc cache thống kê ngắn theo bộ lọc. Không tự thêm index hay sửa DB trong lần rà soát này.

Các API lọc SYC tiếp tục dùng phạm vi quyền và phân trang 10 của module khiếm khuyết hiện có. Chưa rà soát toàn bộ module khiếm khuyết ngoài phạm vi PCT.

## Kết luận

Đã thực hiện các tối ưu tải dữ liệu chính và xác minh mức giảm tại local. Chưa kết luận hiệu năng production hoặc khả năng xuất trên 10.000 phiếu; các giới hạn bảo vệ và kiểm tra CHTT phía server vẫn giữ.
