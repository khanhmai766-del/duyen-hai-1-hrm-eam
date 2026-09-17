"use client";

import * as React from "react";
import { Loader2, ShieldAlert, ThumbsDown, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAiStats, type AiStats } from "@/hooks/useAiStats";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { formatDateTime, cn } from "@/lib/utils";

const RANGES = [7, 14, 30, 90];

/** Mã lỗi của lib/ai-webhook-response.ts, viết lại cho người đọc không nhớ mã. */
const ERROR_LABELS: Record<string, string> = {
  AI_BUSY: "Hàng đợi đầy, người dùng phải chờ quá lâu",
  AI_TIMEOUT: "Quá hạn chờ n8n",
  AI_CONNECTION_FAILED: "Không gọi được n8n",
  AI_PROVIDER_UNAVAILABLE: "Nhà cung cấp AI báo quá tải (503)",
  AI_PROVIDER_RATE_LIMITED: "Nhà cung cấp AI hết lượt (429)",
  AI_WORKFLOW_FAILED: "Workflow n8n lỗi",
};

function percent(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—";
}

function seconds(ms: number | null) {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)} giây`;
}

/**
 * SỐ LIỆU CHẤT LƯỢNG TRỢ LÝ AI — trang để trả lời đúng một câu: nên sửa gì tiếp theo.
 *
 * Ba con số quyết định, theo thứ tự: tỉ lệ câu KHÔNG CÓ NGUỒN (trợ lý trả lời chay), tỉ lệ
 * LỖI (hạ tầng hoặc nhà cung cấp), và danh sách câu bị người dùng chấm CHƯA ĐÚNG (sửa prompt
 * hoặc thêm công cụ). Phần còn lại chỉ là bối cảnh.
 */
export default function AiStatsPage() {
  const rbac = useRbacAccess();
  const allowed = rbac.can("ai-chat", ["manage", "full"]);
  const [days, setDays] = React.useState(14);
  const { data, isLoading, isError, error } = useAiStats(days);

  if (!rbac.isLoading && !allowed) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <p className="font-medium text-ink">Bạn không có quyền truy cập trang này</p>
          <p className="text-sm text-muted-foreground">Cần quyền ai-chat mức quản lý trở lên.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chất lượng trợ lý AI"
        mobileTitle="Chất lượng AI"
        description="Đo hiệu quả DH1 OPS INSIGHT: câu trả lời có dẫn nguồn không, lỗi ở đâu, người dùng chấm thế nào."
      >
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((value) => (
            <Button
              key={value}
              variant={value === days ? "default" : "outline"}
              size="toolbar"
              onClick={() => setDays(value)}
            >
              {value} ngày
            </Button>
          ))}
        </div>
      </PageHeader>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải số liệu…
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-destructive">{(error as Error).message}</CardContent>
        </Card>
      ) : data ? (
        <StatsBody stats={data} />
      ) : null}
    </div>
  );
}

function StatsBody({ stats }: { stats: AiStats }) {
  const { totals, quality, latency } = stats;
  const rated = quality.helpful + quality.unhelpful;
  const peak = Math.max(1, ...stats.daily.map((row) => row.turns));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Lượt hỏi"
          value={String(totals.turns)}
          hint={`${totals.users} người dùng · ${percent(totals.ok, totals.turns)} trả lời xong`}
        />
        <Tile
          label="Trả lời KHÔNG có nguồn"
          value={percent(quality.withoutCitation, totals.ok)}
          hint={`${quality.withoutCitation}/${totals.ok} câu — dấu hiệu trả lời chay`}
          tone={quality.withoutCitation / Math.max(1, totals.ok) > 0.3 ? "warn" : "normal"}
        />
        <Tile
          label="Lượt lỗi"
          value={percent(totals.error, totals.turns)}
          hint={`${totals.error} lỗi · ${totals.stopped} lượt bị bấm Dừng · ${quality.retries} lần tự thử lại`}
          tone={totals.error / Math.max(1, totals.turns) > 0.1 ? "warn" : "normal"}
        />
        <Tile
          label="Độ trễ p95"
          value={seconds(latency.p95)}
          hint={`p50 ${seconds(latency.p50)} · p90 ${seconds(latency.p90)} · lâu nhất ${seconds(latency.max)}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Người dùng chấm">
          {rated === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Chưa có câu trả lời nào được chấm. Nút đánh giá nằm ngay dưới mỗi câu trả lời trong chatbox.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="bg-emerald-500" style={{ width: `${(quality.helpful / rated) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${(quality.unhelpful / rated) * 100}%` }} />
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <Figure label="Hữu ích" value={String(quality.helpful)} className="text-emerald-700 dark:text-emerald-400" />
                <Figure label="Chưa đúng" value={String(quality.unhelpful)} className="text-red-700 dark:text-red-400" />
                <Figure label="Đã chấm" value={percent(rated, totals.ok)} />
              </dl>
              <p className="text-xs text-muted-foreground">
                Trung bình {quality.avgToolCalls.toFixed(1)} lượt tra cứu và {quality.avgAnswerChars} ký tự mỗi câu trả lời.
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Lỗi theo mã">
          {stats.errors.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Không có lượt hỏi nào lỗi trong khoảng này.</p>
          ) : (
            <ul className="space-y-2">
              {stats.errors.map((row) => (
                <li key={row.code} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{ERROR_LABELS[row.code] ?? row.code}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{row.code}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Lượt hỏi theo ngày">
          {stats.daily.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <div className="flex h-32 items-end gap-1">
              {stats.daily.map((row) => (
                <div
                  key={row.day}
                  title={`${row.day}: ${row.turns} lượt · ${row.error} lỗi · ${row.stopped} dừng`}
                  className="flex min-w-0 flex-1 flex-col justify-end gap-px"
                  style={{ height: `${(row.turns / peak) * 100}%` }}
                >
                  <div className="flex-1 rounded-t-sm bg-navy" style={{ flexGrow: Math.max(row.ok, 0.001) }} />
                  {row.error > 0 && <div className="rounded-sm bg-red-500" style={{ flexGrow: row.error }} />}
                  {row.stopped > 0 && <div className="rounded-b-sm bg-slate-300" style={{ flexGrow: row.stopped }} />}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Cột xanh = trả lời xong · đỏ = lỗi · xám = bị bấm Dừng. Trục ngày theo giờ Việt Nam.
          </p>
        </Panel>

        <Panel title="Hỏi từ trang nào">
          {stats.pages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chưa ghi nhận trang nào.</p>
          ) : (
            <ul className="space-y-2">
              {stats.pages.map((row) => (
                <li key={row.path} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-mono text-[12px] text-ink">{row.path}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Trang hay được hỏi nhất là nơi đáng đặt thêm nút Hỏi AI kèm sẵn câu hỏi.
          </p>
        </Panel>
      </div>

      <Panel title="Câu bị chấm Chưa đúng" icon={<ThumbsDown className="h-4 w-4 text-red-600" />}>
        {stats.negatives.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chưa có câu trả lời nào bị chấm chưa đúng trong khoảng này.
          </p>
        ) : (
          <>
            <p className="mb-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Chỉ hiện những cặp hỏi–đáp mà chính người dùng đã bấm Chưa đúng, và chỉ trong 14 ngày hội thoại còn được lưu.
            </p>
            <ul className="space-y-3">
              {stats.negatives.map((row) => (
                <li key={row.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-ink">{row.userName}</span>
                    <span>{formatDateTime(row.ratedAt)}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] font-medium text-ink">{row.question || "(không đọc được câu hỏi)"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-muted-foreground">{row.answer}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}

function Tile({ label, value, hint, tone = "normal" }: {
  label: string;
  value: string;
  hint: string;
  tone?: "normal" | "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-ink")}>
          {value}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">{icon}{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-lg font-bold tabular-nums text-ink", className)}>{value}</dd>
    </div>
  );
}
