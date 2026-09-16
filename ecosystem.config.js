// Cấu hình pm2 của production (VPS /var/www/dh1-app) — GHI ĐÚNG những gì đang chạy thật.
//
// pm2 KHÔNG đọc file này mỗi lần reload: nó chạy theo bản lưu `~/.pm2/dump.pm2`. File chỉ
// dùng khi dựng lại tiến trình từ đầu (máy mới, lỡ `pm2 delete`):
//
//   cd /var/www/dh1-app && pm2 start ecosystem.config.js && pm2 save
//
// Sửa gì ở đây thì phải áp tay bằng lệnh trên, và ngược lại: đổi cấu hình pm2 trên server
// thì sửa luôn file này — bản cũ nằm ngoài git từng lệch hẳn thực tế (cluster "max",
// giới hạn 600M) mà không ai biết.
module.exports = {
  apps: [
    {
      name: "dh1-app",
      cwd: "/var/www/dh1-app",
      // Chạy THẲNG `next`, KHÔNG qua `npm start` (package.json: `start` chỉ là `next start`).
      // Qua npm thì pm2 canh tiến trình vỏ `npm` (~76MB) còn `next-server` là tiến trình con
      // pm2 không thấy — `max_memory_restart` bên dưới đo nhầm vỏ npm nên KHÔNG BAO GIỜ kích
      // hoạt dù next-server rò tới cạn máy (phát hiện 16/09/2026). Bỏ npm còn bớt ~76MB RAM.
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      // FORK một instance là cố ý, KHÔNG chuyển sang cluster: cache node/index/quyền truy
      // cập nằm trong bộ nhớ tiến trình (xem docs/huong-dan-deploy-production.md phụ lục D) — hai instance
      // là hai bản cache lệch nhau. Cũng vì thế: tác vụ nền trong instrumentation.ts (tự đóng
      // PCT mỗi phút) chỉ được chạy ở ĐÚNG MỘT tiến trình.
      exec_mode: "fork",
      instances: 1,
      // Đo 16/09/2026: next-server ~730MB RSS lúc bình thường. Heap bị chặn 1024MB bởi
      // NODE_OPTIONS nên vượt 1200MB RSS là đang rò — ngưỡng chỉ để cứu khi đó.
      max_memory_restart: "1200M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Trước đây biến này chỉ tồn tại trong bản lưu pm2 trên server, không có trong file —
        // dựng lại từ file là mất chặn heap mà không ai biết.
        NODE_OPTIONS: "--max-old-space-size=1024",
      },
    },
  ],
};
