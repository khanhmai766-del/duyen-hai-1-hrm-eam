import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { AI_KNOWLEDGE_CATEGORIES, isAiKnowledgeCategory } from "@/lib/ai-knowledge";
import { allowedAiKnowledgeCategories } from "@/lib/ai-knowledge-store";

export const dynamic = "force-dynamic";

/**
 * Trang đích của nguồn trích dẫn "tài liệu" dưới câu trả lời trợ lý AI. Kiểm quyền nhóm tài liệu
 * y như công cụ tra cứu: không có quyền hay không có tài liệu đều trả 404, không để lộ tài liệu tồn tại.
 */
export default async function KnowledgeDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login");

  const document = await prisma.aiKnowledgeDocument.findUnique({
    where: { id },
    select: { title: true, category: true, publicUrl: true, content: true, updatedAt: true },
  });
  if (!document || !isAiKnowledgeCategory(document.category)) notFound();
  const allowed = await allowedAiKnowledgeCategories(user);
  if (!allowed.includes(document.category)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Trang chủ
      </Link>
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {AI_KNOWLEDGE_CATEGORIES[document.category]}
        </p>
        <h1 className="flex items-start gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <FileText className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
          {document.title}
        </h1>
        <p className="text-xs text-slate-500">
          Tài liệu trợ lý AI dùng để trả lời · cập nhật {document.updatedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
        </p>
        {document.publicUrl && (
          <a
            href={document.publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Mở tệp gốc <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </header>
      <article className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
        {document.content}
      </article>
    </div>
  );
}
