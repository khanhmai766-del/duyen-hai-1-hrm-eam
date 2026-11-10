import { normalizeText } from "@/lib/nav";

/** Chỉ gợi ý đối chiếu chức vụ, không tự cấp vai trò CHTT. */
export function hasCommanderJobTitle(jobTitle: string) {
  const title = normalizeText(jobTitle).replace(/\s+/g, " ").trim();
  const mentionsCommander = /\bchtt\b|\bchi huy truc tiep\b/.test(title);
  // Loại cả các ghi chú đang chờ xét hoặc đã bị thu hồi; không suy diễn là đạt.
  const uncertain = /\b(?:chua|khong|cho|dang hoc|du kien|de xuat|tam dung|thu hoi|het han)\b/.test(title);
  return mentionsCommander && !uncertain;
}

export function matchesPermitPersonText(person: { code: string; name: string; phone?: string; jobTitle?: string }, query: string) {
  return normalizeText(`${person.code} ${person.name} ${person.phone ?? ""} ${person.jobTitle ?? ""}`).includes(normalizeText(query.trim()));
}
