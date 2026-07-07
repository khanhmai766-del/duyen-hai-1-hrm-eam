"use client";

import * as React from "react";
import { CheckCircle2, Clock, Phone, RefreshCw, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SHIFT_TYPE, type ShiftTypeKey } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

type PublicAssignment = {
  id: string;
  positionLabel: string;
  isApproved: boolean;
  user: {
    id: string;
    name: string;
    phone: string | null;
    position: string | null;
    secondaryPosition: string | null;
  };
};

type PublicOrgChartPayload = {
  date: string;
  shiftType: ShiftTypeKey;
  unit: string;
  shift: {
    id: string;
    date: string;
    shiftType: ShiftTypeKey;
    unit: string;
    isAttendanceLocked: boolean;
    assignments: PublicAssignment[];
  } | null;
};

type ApiResponse<T> = {
  data: T | null;
  error: string | null;
};

async function loadOrgChart() {
  const res = await fetch("/api/public/org-chart", { cache: "no-store" });
  const json = (await res.json()) as ApiResponse<PublicOrgChartPayload>;
  if (!res.ok || json.error || !json.data) throw new Error(json.error || "Không tải được sơ đồ tổ chức ca");
  return json.data;
}

export function PublicOrgChartClient() {
  const [data, setData] = React.useState<PublicOrgChartPayload | null>(null);
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      setError("");
      const next = await loadOrgChart();
      setData(next);
      setUpdatedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const assignments = data?.shift?.assignments ?? [];
  const approved = assignments.filter((item) => item.isApproved).length;
  const caLabel = data ? `${SHIFT_TYPE[data.shiftType]?.label ?? ""} · ${formatDate(data.date)}` : "Đang tải";

  return (
    <main className="min-h-dvh bg-[#f4f7f3] text-slate-950">
      <section className="border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Link công khai
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                Sơ đồ tổ chức ca vận hành
              </h1>
              <p className="text-sm font-medium text-slate-600">
                {caLabel}
                {data?.unit ? ` · ${data.unit}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data?.shift && (
                <Badge variant={approved === assignments.length ? "accent" : "secondary"} className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {approved}/{assignments.length} đã duyệt
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={refresh} className="bg-white">
                <RefreshCw className="h-4 w-4" /> Cập nhật
              </Button>
            </div>
          </div>
          {updatedAt && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              Tự động cập nhật mỗi 30 giây · Lần cập nhật cuối {updatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <Card className="border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">{error}</Card>
        ) : !data?.shift ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <UsersRound className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold text-ink">Chưa có dữ liệu ca hiện tại</p>
              <p className="mt-1 text-sm text-muted-foreground">Vui lòng quay lại sau khi ca vận hành được tạo và điểm danh.</p>
            </div>
          </Card>
        ) : assignments.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <UsersRound className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold text-ink">Chưa có nhân sự điểm danh</p>
              <p className="mt-1 text-sm text-muted-foreground">Danh sách sẽ tự cập nhật khi có nhân sự vào ca.</p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assignments.map((item) => (
              <article
                key={item.id}
                className={cn(
                  "rounded-lg border bg-white p-4 shadow-sm",
                  item.isApproved ? "border-emerald-200" : "border-amber-200"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">{item.positionLabel}</p>
                    <h2 className="mt-2 truncate text-lg font-bold text-slate-950">{item.user.name}</h2>
                    <p className="mt-1 truncate text-sm text-slate-500">{item.user.position || "Chưa cập nhật chức vụ"}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      item.isApproved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    )}
                  >
                    {item.isApproved ? "Đã duyệt" : "Chờ duyệt"}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <Phone className="h-4 w-4 text-emerald-700" />
                  {item.user.phone || "Chưa cập nhật số điện thoại"}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
