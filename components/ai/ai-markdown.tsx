import * as React from "react";
import { cn } from "@/lib/utils";

type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; start: number; items: Array<{ text: string; level: number }> };

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)[-*•+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

/**
 * Tách câu trả lời thành khối: tiêu đề, đoạn văn, danh sách. Chỉ hỗ trợ tập Markdown mà trợ lý
 * được dặn dùng — không kéo thêm thư viện, không bao giờ dựng HTML thô (chữ do mô hình sinh ra
 * nên mọi thứ đi qua React để được escape), không biến chuỗi thành liên kết.
 */
export function parseAiMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: heading[1] });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      const indent = (bullet?.[1] ?? ordered?.[1] ?? "").length;
      const itemText = bullet ? bullet[2] : ordered![3];
      const list: Block | null = current;
      if (!list || list.kind !== "list" || (indent === 0 && list.ordered !== Boolean(ordered))) {
        flush();
        current = { kind: "list", ordered: Boolean(ordered), start: ordered ? Number(ordered[2]) : 1, items: [] };
      }
      (current as Extract<Block, { kind: "list" }>).items.push({ text: itemText, level: Math.min(2, Math.floor(indent / 2)) });
      continue;
    }
    const open: Block | null = current;
    if (open?.kind === "list" && /^\s+/.test(rawLine)) {
      const last = open.items[open.items.length - 1];
      last.text = `${last.text} ${line.trim()}`;
      continue;
    }
    if (open?.kind !== "paragraph") {
      flush();
      current = { kind: "paragraph", lines: [] };
    }
    (current as Extract<Block, { kind: "paragraph" }>).lines.push(line.trim());
  }
  flush();
  return blocks;
}

function renderInline(text: string) {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-800 dark:bg-slate-800 dark:text-slate-100">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function Caret() {
  return <span aria-hidden className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-electric" />;
}

export function AiMarkdown({ text, streaming = false, className }: { text: string; streaming?: boolean; className?: string }) {
  const blocks = React.useMemo(() => parseAiMarkdown(text), [text]);
  return (
    <div className={cn("space-y-2.5 break-words text-[13px] leading-6 text-slate-700 dark:text-slate-200", className)}>
      {blocks.map((block, index) => {
        const caret = streaming && index === blocks.length - 1;
        if (block.kind === "heading") {
          return (
            <p key={index} className="pt-1 font-semibold text-slate-900 dark:text-white">
              {renderInline(block.text)}
              {caret && <Caret />}
            </p>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <p key={index}>
              {block.lines.map((line, lineIndex) => (
                <React.Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  {renderInline(line)}
                </React.Fragment>
              ))}
              {caret && <Caret />}
            </p>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List
            key={index}
            start={block.ordered ? block.start : undefined}
            className={cn("space-y-1 pl-5 marker:text-slate-400", block.ordered ? "list-decimal" : "list-disc")}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className={cn("pl-0.5", item.level === 1 && "ml-4", item.level === 2 && "ml-8")}>
                {renderInline(item.text)}
                {caret && itemIndex === block.items.length - 1 && <Caret />}
              </li>
            ))}
          </List>
        );
      })}
      {streaming && blocks.length === 0 && <Caret />}
    </div>
  );
}
