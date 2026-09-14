// Ảnh nào được đi qua bộ tối ưu `/_next/image` (next/image).
//
// PHẢI khớp `images.localPatterns` trong next.config.mjs: chỉ ảnh tĩnh nội bộ trong
// public/brand, public/chucvu, public/icons3d, không query string. Thêm đuôi `.png/.jpg/.jpeg/.webp`
// vì Next phục vụ đuôi lạ (vd `.jfif`) với content-type `application/octet-stream` — bộ tối ưu từ chối.
// Ảnh ngoài (Wikimedia của thẻ thời tiết), ảnh người dùng (/api/files/s3) và đuôi lạ → dùng <img> thường.
const OPTIMIZABLE_LOCAL_IMAGE = /^\/(?:brand|chucvu|icons3d)\/[^?#]+\.(?:png|jpe?g|webp)$/i;

export function isOptimizableImage(src?: string | null): src is string {
  return !!src && OPTIMIZABLE_LOCAL_IMAGE.test(src);
}
