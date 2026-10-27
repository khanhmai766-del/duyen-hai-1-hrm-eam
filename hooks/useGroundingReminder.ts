"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useUpdateProfile } from "@/hooks/useUsers";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { GroundingReminder, GroundingReminderGroup } from "@/lib/grounding-reminder";

export function useGroundingReminder() {
  const { data: session } = useSession();
  const { canReadPage } = useRbacAccess();
  const userId = session?.user?.id;
  const enabled = Boolean(userId) && !session?.user?.mustChangePassword && canReadPage("/grounding-lightning");
  const query = useQuery({
    queryKey: ["grounding-reminder", userId],
    queryFn: async ({ signal }) => (await apiGet<GroundingReminder | null>("/api/grounding-lightning/reminder", { signal })).data,
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  return { ...query, data: enabled ? query.data : null };
}

export function useClaimGroundingReminder() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => apiMutate<GroundingReminder | null>("/api/grounding-lightning/reminder", "POST", { key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grounding-reminder", session?.user?.id] }),
    // Không bật lớp chờ toàn trang cho lời nhắc nền.
    meta: { background: true },
  });
}

/** Cương vị trực thay có thể khác cương vị đang chọn; mở sổ bằng đường cập nhật hồ sơ chuẩn. */
export function useOpenGroundingReminder() {
  const router = useRouter();
  const updateProfile = useUpdateProfile();
  const { update } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (group: GroundingReminderGroup) => {
      if (group.workingPosition) {
        await updateProfile.mutateAsync({ currentPosition: group.workingPosition });
        await update();
        await qc.invalidateQueries({ queryKey: ["grounding-lightning"] });
      }
      router.push(group.href);
    },
  });
}
