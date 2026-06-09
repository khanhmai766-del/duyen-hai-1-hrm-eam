import { Phone } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { OrgChartNodeData } from "@/types";

export function OrgChartNode({
  node,
  variant = "default",
}: {
  node: OrgChartNodeData;
  variant?: "default" | "lead" | "chief";
}) {
  const accentBg =
    variant === "chief" ? "bg-pink-50 border-pink-200" : variant === "lead" ? "bg-blue-50 border-blue-200" : "bg-white border-border";

  return (
    <div className={cn("flex flex-col items-center rounded-xl border p-4 text-center transition-shadow hover:shadow-sm", accentBg)}>
      <span className="text-xs font-medium text-accent underline-offset-2 hover:underline">{node.positionLabel}</span>
      <div className="my-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-bold text-white">
        {node.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={node.user.avatarUrl} alt={node.user.name} className="h-full w-full object-cover" />
        ) : (
          initials(node.user.name)
        )}
      </div>
      <span className={cn("text-sm font-bold", node.isApproved ? "text-ink" : "text-warning")}>{node.user.name}</span>
      {node.user.phone && (
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" /> {node.user.phone}
        </span>
      )}
      {!node.isApproved && (
        <span className="mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Chờ duyệt</span>
      )}
    </div>
  );
}
