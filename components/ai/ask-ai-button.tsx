"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { askAi, type AiAskEntity } from "@/lib/ai-ask";
import { cn } from "@/lib/utils";

/**
 * Nút "Hỏi AI" đặt ngay cạnh dữ liệu đang xem.
 *
 * Gửi kèm thực thể của trang (thiết bị, phiếu khiếm khuyết…) nên trợ lý không phải gọi công cụ
 * "Tìm thiết bị" để đoán người dùng đang nói về cái gì — bớt một lượt gọi mô hình cho mỗi câu,
 * và hết cảnh trả lời nhầm thiết bị trùng tên.
 *
 * Tự ẩn với tài khoản không có quyền `ai-chat`, giống nút mở chatbox.
 *
 * `variant="toolbar"` để đứng chung hàng nút của trang chi tiết; mặc định là con chip nhỏ, hợp
 * với chỗ nằm lẫn trong nội dung như phần mở rộng của một phiếu khiếm khuyết.
 */
export function AskAiButton({
  question, entity, send = false, label = "Hỏi AI", variant = "chip", className,
}: {
  question: string;
  entity?: AiAskEntity | null;
  send?: boolean;
  label?: string;
  variant?: "chip" | "toolbar";
  className?: string;
}) {
  const rbac = useRbacAccess();
  if (rbac.isLoading || !rbac.can("ai-chat", ["read", "personal", "manage", "full"])) return null;
  if (variant === "toolbar") {
    return (
      <Button
        variant="outline"
        size="toolbar"
        className={className}
        title="Mở trợ lý AI với câu hỏi về mục đang xem"
        onClick={() => askAi({ question, send, entity })}
      >
        <Sparkles className="h-4 w-4" /> {label}
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => askAi({ question, send, entity })}
      title="Mở trợ lý AI với câu hỏi về mục đang xem"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition",
        "hover:border-electric/40 hover:bg-blue-50 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric",
        "dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
        className
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
