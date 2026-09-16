"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";

export type AiStats = {
  range: { days: number; from: string };
  totals: { turns: number; ok: number; error: number; stopped: number; users: number };
  quality: {
    withoutCitation: number;
    helpful: number;
    unhelpful: number;
    avgToolCalls: number;
    avgAnswerChars: number;
    retries: number;
  };
  latency: { p50: number | null; p90: number | null; p95: number | null; max: number | null };
  errors: Array<{ code: string; count: number }>;
  pages: Array<{ path: string; count: number }>;
  daily: Array<{ day: string; turns: number; ok: number; error: number; stopped: number }>;
  negatives: Array<{ id: string; ratedAt: string; userName: string; question: string; answer: string }>;
};

export function useAiStats(days: number) {
  return useQuery({
    queryKey: ["ai-stats", days],
    queryFn: async () => (await apiGet<AiStats>(`/api/ai/stats?days=${days}`)).data,
    staleTime: 60_000,
  });
}
