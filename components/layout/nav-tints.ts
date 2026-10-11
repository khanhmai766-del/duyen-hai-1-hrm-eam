import type { NavItem, NavSection } from "@/lib/nav";

// Tông màu ô icon của thanh bên và thanh nổi "Thường dùng", gán theo vị trí của mục (giữ đúng màu của bảng truy cập
// nhanh ở thanh trên — bảng đã gỡ 11/10/2026).
export const GRID_TINTS = [
  "bg-gradient-to-br from-sky-100 to-sky-200 text-sky-700",
  "bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700",
  "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700",
  "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700",
  "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-700",
  "bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700",
  "bg-gradient-to-br from-teal-100 to-teal-200 text-teal-700",
  "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-700",
  "bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-700",
  "bg-gradient-to-br from-fuchsia-100 to-fuchsia-200 text-fuchsia-700",
  "bg-gradient-to-br from-lime-100 to-lime-200 text-lime-700",
  "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700",
  "bg-gradient-to-br from-pink-100 to-pink-200 text-pink-700",
  "bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700",
];

export const gridTint = (index: number) => GRID_TINTS[index % GRID_TINTS.length];

/**
 * Mọi mục điều hướng được phép theo thứ tự thanh bên: mục có mục con → các mục con được phép, mục lẻ → chính nó.
 * Màu ô = vị trí trong danh sách này — thanh bên và thanh nổi cùng dùng nên một mục luôn một màu ở cả hai nơi.
 */
export function launcherItems(sections: NavSection[], allowed: (item: NavItem) => boolean): NavItem[] {
  return sections.flatMap((section) => section.items.flatMap((item) => {
    const children = item.children?.filter(allowed);
    if (children) return children;
    return allowed(item) ? [item] : [];
  }));
}
