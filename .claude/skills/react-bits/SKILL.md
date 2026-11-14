---
name: react-bits
description: >
  Tìm, chọn và tích hợp component React Bits từ DavidHDev/react-bits vào
  dự án Next.js, ưu tiên TypeScript + Tailwind. Dùng khi người dùng nhắc
  React Bits, đưa liên kết demo hoặc yêu cầu áp dụng một component/hiệu ứng
  của thư viện này. Không tự áp dụng cho mọi thay đổi giao diện.
---

# React Bits cho PowerPlant EAM

Skill nội bộ của dự án, không phải skill chính thức do React Bits phát hành.
Giúp lấy đúng mã nguồn component được chọn và tích hợp vào giao diện hiện có.
Việc cài skill không cài component hay dependency vào ứng dụng.

## Nguồn tra cứu

- Repo: https://github.com/DavidHDev/react-bits
- Demo và tài liệu: https://reactbits.dev
- Cài đặt: https://reactbits.dev/get-started/installation
- Registry: `https://reactbits.dev/r/{name}.json`
- Giấy phép: https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md

Tra cứu trực tiếp nguồn chính thức khi sử dụng; tên, props và dependency có thể
thay đổi. Không dùng trí nhớ hoặc tên hiệu ứng để tự dựng lại rồi gọi đó là
component React Bits.

## Chọn và lấy component

Nếu người dùng đã chỉ định component hoặc demo, dùng đúng lựa chọn đó. Nếu họ
muốn xem mẫu, đưa liên kết demo liên quan; nếu họ nhờ chọn, chọn theo mục đích
của màn hình và độ nhẹ trên điện thoại. Chỉ hỏi khi lựa chọn còn thiếu làm thay
đổi đáng kể kết quả. Không cần chờ chọn mẫu để sửa một lỗi tích hợp đã rõ.

Ưu tiên biến thể `TS-TW` (TypeScript + Tailwind). Ví dụ registry đã kiểm tra:
`https://reactbits.dev/r/SplitText-TS-TW.json`. Đọc `files[].content`,
`dependencies` và `registryDependencies` của mục thực tế trước khi tích hợp;
không đoán dependency từ tên component. Nếu biến thể này không có, xem bản
TypeScript + CSS và chuyển kiểu trong phạm vi component khi phù hợp.

Chỉ tải các file và tài nguyên cần cho yêu cầu. Nếu registry không truy cập
được, tìm mã nguồn của đúng biến thể trong repo chính thức. Khi cả hai nguồn
đều không đọc được, báo giới hạn thay vì bịa API hoặc props.

README upstream hỗ trợ shadcn CLI, ví dụ:

```sh
npx shadcn@latest add https://reactbits.dev/r/SplitText-TS-TW.json
```

Đây là lựa chọn khi phù hợp với cấu hình dự án. Kiểm tra trước các file CLI sẽ
thêm hoặc sửa. Có thể lấy mã nguồn trực tiếp để tránh thay đổi cấu hình không
cần thiết. Không chạy `shadcn init`, thêm registry, MCP hay clone toàn bộ repo
chỉ để lấy một component. Chỉ thêm dependency thực sự cần; giữ lockfile nhất quán.

## Tích hợp trong dự án

- Đọc `AGENTS.md` và phần mã đích; dùng CodeGraph trước khi tìm hiểu mã được
  lập chỉ mục. Giữ các component, token màu và luồng dữ liệu hiện có.
- Đặt mã React Bits trong thư mục component phù hợp với cấu trúc xung quanh.
  Việt hóa nội dung hiển thị, dùng dữ liệu và props thực tế của màn hình.
- Với hooks, animation và DOM API, dùng ranh giới `"use client"` nhỏ nhất.
  Không đọc `window`/`document` ở cấp module hoặc trong render phía server.
  Chỉ dùng dynamic import với `ssr: false` từ Client Component khi thực sự cần.
- Dọn animation, listener, observer và vòng `requestAnimationFrame` khi unmount.
  Giữ hydration ổn định; kiểm tra kích thước cha cho canvas/WebGL.
- Giữ thao tác chạm, bàn phím và focus hoạt động. Hiệu ứng hover phải có cách
  dùng trên điện thoại nếu nó mang chức năng. Lớp trang trí không chặn nút,
  không che thông tin và không làm thay đổi cách submit form.
- Tôn trọng `prefers-reduced-motion`, cung cấp trạng thái tĩnh đọc được. Với
  hiệu ứng nặng, giảm mật độ/độ phân giải và ngừng chạy khi ngoài màn hình;
  bảo đảm nội dung vẫn hiện khi WebGL không khả dụng nếu có dùng WebGL.
- Khi sao chép mã, giữ thông báo bản quyền và giấy phép upstream đi kèm theo
  yêu cầu của `LICENSE.md`; không mô tả thư viện là MIT thuần.

## Kiểm tra và bàn giao

Sau khi sửa UI, áp dụng skill `kiem-tra-giao-dien` và tự xem ảnh ở điện thoại
và máy tính theo `AGENTS.md`. Chạy type-check/lint phù hợp với phần đã sửa;
không chạy build nếu chưa được yêu cầu. Kiểm tra lỗi console, hydration và
animation sau khi chuyển trang nếu có thay đổi các phần này.

Báo component đã dùng, liên kết nguồn/demo, dependency mới và kết quả kiểm tra.
Nêu rõ giới hạn chưa xác minh. Việc tạo skill này không tự cho phép sửa UI,
commit, push hoặc triển khai.
