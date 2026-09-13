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
      script: "npm",
      args: "start",
      // FORK một instance là cố ý, KHÔNG chuyển sang cluster: cache node/index/quyền truy
      // cập nằm trong bộ nhớ tiến trình (xem docs/deploy-equipment-tree.md) — hai instance
      // là hai bản cache lệch nhau.
      exec_mode: "fork",
      instances: 1,
      // Tiến trình thường ~400MB; ngưỡng này chỉ để cứu khi rò bộ nhớ.
      max_memory_restart: "1200M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
