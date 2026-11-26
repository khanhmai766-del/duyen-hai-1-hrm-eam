/**
 * Gốc giao diện "web độ rung" (VibraControl cũ). Mọi CSS cũ nằm dưới `.vc-app` (vibracontrol.css).
 * Chỉ dùng nền sáng (chủ dự án 2026-11: bỏ chế độ tối tự đổi theo giờ của web cũ).
 */
export function VcAppRoot({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`vc-app ${className ?? ""}`} data-theme="light">
      {children}
    </div>
  );
}
