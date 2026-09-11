# Sổ cấp phiếu công tác

Đường dẫn: `/work-permits`, mục **Quản lý tài liệu số → Sổ cấp phiếu công tác** (máy tính và menu Thêm trên điện thoại).

## Sổ cấp PCT chung

- Hai sổ Cơ – Nhiệt – Hóa và Điện, nhập số thực tế, không tự cấp số. Số thuần được hiển thị theo mẫu chung `{số}/{năm}/VH1-NĐDH` trong bảng, tiêu đề chi tiết, các lần làm việc, cảnh báo và Excel. Form xem trước số đầy đủ ngay khi nhập. Số đã đầy đủ/mã cũ giữ nguyên, không ghép đuôi hai lần; dữ liệu số gốc không bị ghi lại.
- Cột STT trong mẫu giấy ghi KH (kế hoạch), ĐX (đột xuất) hoặc SC (sự cố), không phải số thứ tự dòng. Form, bảng, bộ lọc và cột đầu Excel dùng phân loại này. KH/ĐX/SC không bắt buộc ở mọi trạng thái, kể cả Đã cấp. Phiếu cũ giữ null, không tự gán loại.
- Nháp là lưu tạm, chưa ghi nhận cấp phiếu. Form có chỉ dẫn để chọn Đã cấp khi nhập phiếu đã cấp thực tế.
- Số chuẩn hóa thành chữ hoa, bỏ khoảng trắng, duy nhất theo loại + năm đối với phiếu chưa hủy. Phiếu hủy giữ nguyên số trong lịch sử nhưng giải phóng số để cấp lại. Khi ghi phiếu mới hoặc sửa phiếu nháp, form chỉ truy vấn số lớn nhất dạng số của các phiếu chưa hủy trong đúng sổ Cơ/Điện và năm đang chọn, rồi gợi ý số kế tiếp để điền nhanh; mã phi số không tham gia tính. Đây là gợi ý tại thời điểm tải, số trùng vẫn được chặn khi lưu.
- Danh sách mặc định không lấy phiếu đã đóng và phiếu đã hủy; hai trạng thái này chỉ xuất hiện trên website khi người dùng chọn riêng bộ lọc tương ứng. Excel vẫn lấy phiếu đã đóng và luôn loại phiếu hủy, kể cả khi bộ lọc hiện tại đang chọn `Đã hủy`.
- Phiếu đã cấp không đổi số, năm, loại sổ hoặc loại đơn vị. Phiếu đóng/hủy khóa sửa; không có thao tác xóa.
- Thông tin sổ giấy, tổ máy, thiết bị/vị trí, ngày giờ Việt Nam, kết quả, ghi chú và danh sách nhân viên.
- Danh sách chính phân trang ở server, 10 phiếu/trang.
- Tìm kiếm không phân biệt dấu; lọc loại, trạng thái, tổ máy, nội bộ/nhà thầu và khoảng ngày thực hiện. Tìm thêm CHTT, mã người, đơn vị và nhân viên trong các lần làm việc.
- Chọn SYC bằng API khiếm khuyết hiện có, giữ phạm vi xem của API đó. Sao chép số SYC, công việc và thiết bị vào PCT; chưa ghi ngược số PCT/trạng thái vào SYC.
- PCT có thể chọn một cương vị nghiệp vụ hoặc để `Tất cả cương vị` (mặc định). Danh sách sổ có bộ lọc cương vị; cương vị đã lưu hiện cùng tổ máy/vị trí và trong chi tiết. Khi chọn SYC, API chỉ ưu tiên SYC khớp cương vị lên đầu trước khi phân trang, không lọc bỏ cương vị khác; tìm kiếm vẫn tra được toàn bộ SYC trong phạm vi người dùng được phép xem. Sổ Excel giữ nguyên cấu trúc, không thêm cột cương vị.
- Excel xuất kết quả lọc, tối đa 10.000 phiếu: chỉ một sheet Sổ cấp PCT; chi tiết các lần làm việc tra cứu trên website. Có cấu hình in ngang/lặp tiêu đề.
- Mọi tài khoản đăng nhập được tra cứu/xuất sổ. ADMIN, MANAGER, SUPERVISOR được ghi phiếu, quản lý nhân sự và ghi nhận mở/kết thúc.
- Với nhà thầu, người cấp lấy từ tài khoản đăng nhập ở phía server khi tạo/cấp từ nháp, không nhận tên hoặc mã người cấp do client gửi. Sau khi đã cấp, giữ nguyên người cấp dù người khác cập nhật. Phiếu nội bộ giữ cách ghi nhận cũ; người cho phép/xác nhận từng lần vẫn nhập theo thực tế.
- CHTT nhà thầu chọn từ danh bạ đang hoạt động, có quyền CHTT; lưu định danh và tên tại thời điểm cấp. Nháp có thể chưa chọn. Không suy đoán định danh từ tên của phiếu cũ. Mở lần đầu điền sẵn CHTT đã chọn; những lần sau gợi ý CHTT lần trước, vẫn được đổi và kiểm tra xung đột ở server.
- Người cho phép và người xác nhận kết thúc chọn từ nhân sự website đang hoạt động qua API nhẹ, tìm không dấu và phân trang 20 người ngay tại DB; chỉ trả id/tên/mã/chức vụ/đơn vị. Áp dụng khi mở/kết thúc lần nhà thầu và ở ô người cho phép của phiếu nội bộ; lưu tên theo cấu trúc hiện có.
- Cột Số PCT / ngày hiện số phiếu, nhãn PCT giấy / PCT điện tử theo hình thức đã chọn và ngày thực hiện, bỏ dòng năm cấp số lặp lại. Nhãn hình thức cũng hiển thị trong form và chi tiết; không biểu thị đã có chức năng in hay tích hợp NKVH. Năm vẫn giữ trong dữ liệu/form để kiểm tra trùng số.
- Hình thức cấp phiếu lưu riêng (`format`: PAPER/ELECTRONIC), chọn được trong form. Khi chọn loại đơn vị, mặc định nhà thầu là giấy, nội bộ là điện tử; có thể đổi, kể cả nội bộ dùng giấy khi hệ thống điện tử lỗi. Phiếu cũ chưa có hình thức riêng (`null`) hiển thị theo mặc định loại đơn vị, được ghi rõ khi cập nhật. Xuất Excel có cột Hình thức phiếu, không có cột Trạng thái. Hộp xuất cho chọn toàn bộ sổ Cơ/Điện theo năm cấp số (bỏ các bộ lọc bên ngoài) hoặc theo bộ lọc hiện tại. Số PCT được phép lặp sang năm mới; không tự tăng/cấp số. Không thay đổi quy tắc phiên làm việc chỉ áp dụng cho nhà thầu.
- Phiếu mới mặc định nhà thầu; lãnh đạo/nhân viên nằm trong mục bổ sung để ưu tiên thao tác chọn CHTT.
- Nhật ký trước/sau lưu cùng giao dịch với phiếu. Kiểm tra phiên bản để chống ghi đè.

## Chỉ nhà thầu: các lần làm việc

**Quy tắc đã được người dùng xác nhận:** một PCT có nhiều lần làm việc (nhiều ngày hoặc nhiều lần/ngày), mỗi lần có thể đổi CHTT và danh sách nhân viên. Phần quản lý này chỉ áp dụng cho nhà thầu.

1. Ghi cấp phiếu: trạng thái Đã cấp, chưa giữ CHTT.
2. Mở lần làm việc: chọn CHTT từ danh sách nhà thầu, nhập giờ thực tế, chọn người cho phép. CHTT tự được tính là người công tác; danh sách nhân viên bổ sung được để trống, không bắt nhập số nhân viên. Tổng người ghi nhận là CHTT + nhân viên bổ sung, loại CHTT trùng trong danh sách. Phiếu chuyển Đang thực hiện.
3. Kết thúc lần làm việc: nhập giờ kết thúc thực tế, người xác nhận, tiến độ lũy kế và ghi chú. Tiến độ bắt buộc là số nguyên từ 0–100%, được lưu theo lần làm việc và cập nhật lên PCT. Giải phóng CHTT, PCT chuyển Chờ làm tiếp.
   Trên website, tiến độ mới nhất hiển thị ngay dưới trạng thái ở danh sách và chi tiết; lần kết thúc sau mặc định theo giá trị gần nhất để người dùng điều chỉnh. Sổ Excel giữ nguyên cấu trúc và không bổ sung tiến độ.
4. Khi đang làm, nút Bàn giao / đổi CHTT cho chọn người mới, giờ bàn giao và người xác nhận từ nhân sự website. Giao dịch khóa PCT và hai CHTT theo thứ tự cố định, kiểm tra người mới rảnh, kết thúc lần cũ rồi mở lần mới cùng thời điểm, giữ trạng thái ACTIVE. Nếu lỗi hoặc xung đột, toàn bộ giao dịch hoàn tác.
5. Có thể mở lần tiếp theo, hoặc đóng PCT khi toàn bộ công việc hoàn tất. Khi có lần đang mở, không được sửa/đóng/hủy PCT để vượt qua kiểm tra.

- Không giữ CHTT ngay khi cấp số. Không tự giải phóng vào nửa đêm hay cuối ca.
- Không cho một CHTT có hai lần làm việc trùng thời gian, kiểm tra chung hai sổ Cơ/Điện. Khi mở lần chưa có giờ kết thúc, khoảng thời gian tính từ giờ mở trở đi; vì vậy việc ghi bổ sung phải theo thứ tự thời gian.
- Cho phép mở lần tiếp theo đúng thời điểm kết thúc lần trước. Không nhập mốc tương lai hoặc kết thúc trước khi mở.
- Khi thêm/sửa nhân sự, chọn nhà thầu từ tên đã có trong toàn bộ danh bạ (không phụ thuộc trang, vai trò hay trạng thái nhân sự); tìm không dấu. Có nút nhập nhà thầu mới, danh sách tự cập nhật sau khi lưu.
- Danh bạ dùng số thẻ an toàn (khóa dữ liệu `code` để tương thích), tên, đơn vị, cờ CHTT và hoạt động. Nhập số thẻ thực tế, cho phép chữ tiếng Việt, số, dấu /, chấm, gạch ngang/gạch dưới, tối đa 80 ký tự; chuẩn hóa Unicode NFC và chữ hoa. Số thẻ lưu cùng nhân sự và bản ghi từng lần làm việc để phục vụ điền mẫu PCT sau này; số cũ không tự chuyển thành số thẻ khác. Không tạo thêm hồ sơ cho cùng một người khi đổi công ty. Chưa nhập danh sách thật vì người dùng sẽ cung cấp sau.
- Danh bạ hiển thị các lần đang mở của từng người, gồm vai trò CHTT và nhân viên (đối chiếu định danh nhân sự hoặc số thẻ khi nhập tay khớp chính xác). Ghi số PCT, sổ Cơ/Điện, vai trò và giờ bắt đầu; các lần đã kết thúc không hiển thị. Danh sách chọn người cập nhật mỗi 30 giây khi mở; danh bạ quản lý không polling. Đây là chú thích để người cấp xem xét; không bổ sung luật chặn nhân viên đứng nhiều phiếu.
- Hồ sơ một CHTT đang làm việc không được sửa/ngừng hoạt động. Các lần làm việc lưu tên, mã, đơn vị, thành viên tại thời điểm ghi nhận; sửa danh bạ về sau không đổi lịch sử.
- Thành viên chọn từ danh bạ bằng nhiều ô đánh dấu rồi bấm Thêm người đã chọn; giữ lựa chọn qua tìm kiếm/phân trang, đánh dấu và khóa người đã có (theo hồ sơ hoặc số thẻ), tối đa 200 thành viên. Có thể nhập tên; hiện chỉnh danh sách trước khi mở lần làm việc. Lần đã ghi nhận không có chức năng sửa giờ/CHTT/thành viên; nếu cần đính chính phải bổ sung quy trình có lịch sử riêng.
- Phiếu nội bộ giữ luồng trạng thái thủ công ban đầu; API các lần làm việc từ chối phiếu nội bộ.

### Chống thao tác đồng thời

Tất cả cập nhật vòng đời khóa dòng PCT trước; mở/kết thúc lần làm việc khóa thêm hồ sơ CHTT rồi kiểm tra khoảng thời gian. Hai PCT tranh cùng CHTT được xử lý tuần tự. SQL bổ sung hai unique partial index cho mỗi PCT và mỗi CHTT chỉ có một lần chưa kết thúc, cùng CHECK thứ tự thời gian. Prisma 5 không biểu diễn partial index trong schema, cần giữ chúng trong SQL triển khai.

## Điền và in mẫu PCT

Đã nhận và rà soát 5 file ngày 08/09/2026: PCT Cơ, PCT Điện, hai mẫu đăng ký và hướng dẫn cấp giấy. Đơn vị công tác lập giấy đăng ký; website chỉ tiếp nhận để cấp PCT nhà thầu. Theo điều chỉnh mới nhất, làm trước định danh người cấp và chọn CHTT; chưa triển khai hồ sơ chi tiết, mẫu Word/PDF hay lưu bản in. Phần nội bộ và liên kết website NKVH để sau. Xuất sổ Excel hiện có không phải biểu mẫu PCT chính thức.

## Khởi tạo DB

Chỉ chạy sau khi được phép thay đổi DB ở môi trường được chỉ định:

```sh
npx prisma generate
npx prisma db execute --file prisma/manual/add-work-permit-register.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/manual/add-work-permit-identities.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/manual/add-work-permit-format.sql --schema prisma/schema.prisma
```

Đã áp dụng SQL trên DB local `localhost:5433/powerplant` ngày 08/09/2026 theo quyền người dùng cấp. Chưa áp dụng trên server. Đã bổ sung cột `workType` bằng `prisma/manual/add-work-permit-work-type.sql` trên local; môi trường đã có bảng sổ cần áp file này, môi trường mới dùng SQL khởi tạo đã cập nhật.

Đã áp `add-work-permit-format.sql` trên local để thêm cột nullable `format`.

Đã áp `add-work-permit-identities.sql` trên local để thêm hai cột nullable `issuerUserId`, `commanderPersonId`; phiếu cũ không tự gán người.

SQL chạy một lần trong giao dịch, tạo `WorkPermit`, `WorkPermitHistory`, `WorkPermitPerson`, `WorkPermitSession`, các chỉ mục và ràng buộc. Không chạy `db:push`, không thay đổi bảng cũ. Không tự tạo bảng trong API. Khi chưa áp SQL, màn hình báo sổ chưa khởi tạo.

## Kiểm tra

```sh
npx tsx scripts/check-work-permits.ts
npx tsc --noEmit --incremental false
```

Kết quả ngày 08/09/2026:

- 39 kiểm tra nhập liệu đạt.
- 129 kiểm tra qua HTTP thật và PostgreSQL local đạt (gồm từ chối CHTT không hợp lệ, chống giả mạo người cấp/CHTT, cấp từ nháp và giữ người cấp khi người khác sửa; hình thức mặc định, nội bộ phiếu giấy, lưu lại lựa chọn và từ chối giá trị sai): đăng nhập, phân quyền, tạo trùng số, mở đồng thời Cơ/Điện cùng CHTT, đổi người giữa các lần, thời điểm tiếp giáp/giao nhau/qua ngày, khóa phiếu đang mở, giữ lịch sử khi đổi danh bạ, vòng đời phiếu nội bộ, chống cập nhật cùng phiên bản, Excel chỉ có sheet Sổ cấp PCT.
- Route màn hình `/work-permits` trả 200 và có nội dung sổ. Chưa kiểm tra trực quan/click trên trình duyệt vì trình duyệt tích hợp không khả dụng.
- Phát hiện và sửa tìm kiếm mã có `_`/`%` phải khớp ký tự nguyên văn thay vì wildcard LIKE.
- Đã dọn toàn bộ bản ghi, tài khoản và audit fixture. Dữ liệu ngoài fixture được giữ nguyên.

Chạy lại kiểm thử tích hợp **chỉ khi được phép tạo/dọn dữ liệu thử trên DB local**:

```sh
# Terminal 1: không gửi bản sao audit thử lên S3, giữ địa chỉ xác thực ở local.
AUDIT_LOG_S3_ENABLED=false AUTH_URL=http://localhost:3030 NEXTAUTH_URL=http://localhost:3030 npm run dev:next -- -p 3030
# Terminal 2: tự tạo và dọn fixture riêng; không dùng tài khoản/hồ sơ thật.
npx tsx scripts/check-work-permits-local.ts
```

Build, đẩy GitHub, cập nhật server và reload chỉ thực hiện khi được yêu cầu.

Cập nhật 10/09/2026: Loại đơn vị và Hình thức cấp phiếu đặt đầu form. Kiểm tra API/DB đạt 166 tình huống, gồm CHTT làm một mình, bàn giao thành công, chặn người bận, cùng người, trước giờ mở, bàn giao đồng thời, hoàn tác khi lỗi và loại CHTT khỏi nhân viên bổ sung.

Chi tiết phiếu mặc định chỉ tải 2 lần làm việc và 2 tiêu đề cập nhật mới nhất cùng tổng số. Xem thêm tải từng trang 10 mục phía server; Thu gọn độc lập. Nội dung before/after của từng cập nhật chỉ tải khi mở mục đó. Các trang gắn phiên bản phiếu để tránh ghép lịch sử khác thời điểm.

Tối ưu 10/09/2026: response danh sách chỉ select trường hiển thị, danh bạ loại truy vấn CHTT trùng, danh sách công ty DISTINCT tại SQL. 233 kiểm tra API/DB đạt, gồm phân trang lịch sử dài, snapshot theo nhu cầu, phân trang/tìm không dấu nhân sự, phân trang sổ, năm xuất Excel, dùng lại số ở năm sau và không xuất cột Trạng thái. Type-check chưa sạch do các lỗi TBYCNN ngoài phần PCT.

## Phụ lục mối nguy – biện pháp an toàn (local)

- Hai mục cạnh sổ Cơ/Điện quản lý **cặp** mối nguy–biện pháp. Danh mục Cơ gồm Cơ–Nhiệt–Hóa, tách riêng Điện. Tìm không dấu, 10 mục/trang, thêm/sửa/ngừng sử dụng với quyền ghi PCT.
- Chỉ PCT **giấy** có `safetyItems`. Người cấp chọn cặp rồi phân công `forAuthorization` (đơn vị cho phép), `forExecution` (đơn vị công tác), hoặc cả hai. Danh mục không tự phân công. Nháp có thể chưa phân công; khi ghi đã cấp, mỗi cặp đã chọn cần ít nhất một đơn vị.
- Có thể sửa câu chữ trên phiếu, bổ sung cặp riêng, bỏ cặp và đổi thứ tự. Không bắt buộc có cặp để tiếp tục quản lý các phiếu cũ. Đổi Cơ/Điện hoặc đổi sang điện tử sẽ hỏi trước khi bỏ các lựa chọn trên form; API kiểm tra loại và hình thức độc lập với UI.
- Snapshot JSON lưu nội dung và phân công ngay trên phiếu, có trong lịch sử. Sửa/ngừng sử dụng danh mục không làm đổi phiếu cũ; nguồn ngừng sử dụng không được chọn mới. API cập nhật thiếu trường mới giữ nguyên snapshot.
- Danh sách PCT và Excel không tải thêm snapshot an toàn; chi tiết mới đọc nội dung. Tối đa 100 cặp/phiếu, mối nguy 1.000 ký tự và biện pháp 5.000 ký tự.
- `data/work-permit-safety-samples.json`: 32 cặp trích từ phần A của ba phiếu Pha hóa chất, Lưới quay rác 2A và Xử lý khiếm khuyết ống lò S2 do người dùng cung cấp. Chỉ gộp cặp trùng nội dung, giữ biến thể và ghi nguồn. Không suy diễn quy định hay bổ sung nội dung kỹ thuật từ bên ngoài. Phần B/C độc lập trong tài liệu không đưa thành danh mục riêng.
- `prisma/manual/add-work-permit-safety.sql` thêm một bảng danh mục và cột JSON trên WorkPermit. `npm run seed:work-permit-safety` thêm thiếu theo ID cố định và không ghi đè mục đã chỉnh. Với DB ngoài local phải truyền rõ `-- --allow-remote`; chỉ dùng khi đã được cho phép đồng bộ dữ liệu lên môi trường đó.

### Điền mẫu Word

`GET /api/work-permits/[id]/document` chỉ cho phiếu giấy đã cấp, không xuất nháp/hủy. Dùng mẫu Word người dùng cung cấp tại `templates/work-permit-mechanical.docx` và `templates/work-permit-electrical.docx`.

- Cơ–Nhiệt–Hóa: phần A chứa các cặp; B/C lấy biện pháp theo phân công, gộp nội dung trùng nguyên văn trong từng nhóm. Tự thêm dòng vượt số dòng mẫu và giữ các ô đánh dấu/ghi chú trống.
- Điện: cặp mối nguy–biện pháp vào 2.5; phân công ở phụ lục riêng. Không tự điền các xác nhận đã cắt điện, tiếp đất hoặc đã thực hiện biện pháp từ lựa chọn dự kiến.
- Điền số phiếu, công việc, vị trí và thông tin nhân sự tương ứng có trong sổ. Các thông tin chưa quản lý (chức vụ, bậc ATĐ…) và chữ ký vẫn để trống, cần hoàn thiện trước khi dùng. Không suy diễn thời gian công tác từ ngày ghi sổ.
- Kiểm tra tự động: snapshot, phân quyền, phân trang, danh mục tách loại, giấy/điện tử, phân công, cấu trúc Word và phiếu 20 cặp. Chưa có LibreOffice để kiểm tra bố cục in trực quan tại môi trường local này.

### Bổ sung thông tin cấp phiếu giấy

- `registrationNumber`: số ĐKCT, tối đa 200 ký tự, chấp nhận mã đầy đủ hoặc chữ (ví dụ “điện trực tiếp”). Tùy chọn; chuỗi trắng chuẩn hóa thành rỗng. Mẫu Cơ chỉ hiện dòng “Số ĐK: …” khi có giá trị, không lấy số SYC thay thế. Không tự ghép hậu tố/năm vào ĐKCT.
- `workScope`: phạm vi công tác riêng, tối đa 5.000 ký tự, không suy diễn từ địa điểm.
- `plannedStartAt` / `plannedEndAt`: ngày giờ dự kiến, tùy chọn, hiển thị và in theo giờ Việt Nam. Nếu có cả hai thì kết thúc không trước bắt đầu. Độc lập với mốc cấp/cho phép/kết thúc thực tế; có thể dự kiến qua ngày hoặc năm mới.
- `disciplines`: chọn nhiều chuyên môn Thủy/Cơ/Nhiệt/Hóa cho sổ Cơ – Nhiệt – Hóa; mặc định chưa chọn, không tự suy từ tên sổ. Mẫu đánh dấu `[X]` đúng các lựa chọn. Không cho gửi chuyên môn này sang sổ Điện.
- Form PCT giấy có nhóm thông tin điền mẫu. ĐKCT và chuyên môn dành cho mẫu Cơ; thời gian kế hoạch và phạm vi cũng điền vào các vị trí tương ứng của mẫu Điện.
- Chi tiết và lịch sử hiển thị các trường mới; tìm kiếm PCT bao gồm ĐKCT/phạm vi trên phiếu đã lưu. API danh sách/Excel giữ danh sách cột hiện có. Client cập nhật thiếu trường mới giữ nguyên dữ liệu cũ, nhưng gửi rỗng/null cho phép xóa thông tin tùy chọn.
- SQL bổ sung local: `prisma/manual/add-work-permit-paper-fields.sql`. Không áp dụng toàn schema hoặc thao tác server.
- 90 kiểm tra API/DB và Word cho phần an toàn + thông tin giấy; kiểm tra ĐKCT trống/có chữ, chuyên môn, ngày giờ, giữ dữ liệu khi cập nhật thiếu trường, phân công và phân quyền. XML các file Word thử được kiểm tra cấu trúc; chưa có công cụ render bố cục in.
