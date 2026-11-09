"use client";

import { useEffect } from "react";
import { groupSpreadsheetCells, parseSpreadsheetClipboard } from "@/modules/ctktkt/lib/spreadsheet-grid";

const selector = 'input:not([type]), input[type="text"], input[type="number"]';

function isSpreadsheetInput(element: Element | null): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement) || !element.closest(".ctktkt-content")) return false;
  if (element.disabled || element.readOnly || element.dataset.spreadsheetIgnore === "true") return false;
  if (element.dataset.cell) return false; // Trang Chỉ tiêu đã có bộ xử lý quyền/ô khóa chuyên biệt.
  if (element.type === "search" || element.getAttribute("role") === "searchbox") return false;
  const hint = `${element.placeholder || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
  if (hint.includes("tìm kiếm") || hint.includes("search")) return false;
  return element.matches(selector);
}

function scopeOf(input: HTMLInputElement) {
  return input.closest("table, [data-spreadsheet-grid]") || input.closest(".ctktkt-content") || document.body;
}

function gridOf(input: HTMLInputElement) {
  const scope = scopeOf(input);
  const candidates = Array.from(scope.querySelectorAll(selector)).filter(isSpreadsheetInput);
  return groupSpreadsheetCells(candidates.map(item => {
    const rect = item.getBoundingClientRect();
    return { item, top: rect.top, left: rect.left };
  })).map(row => row.map(cell => cell.item));
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function focusAndSelect(input: HTMLInputElement | undefined) {
  if (!input) return;
  input.focus();
  input.select();
  input.scrollIntoView({ block: "nearest", inline: "nearest" });
}

type WheelTarget = { tagName?: string; type?: string; closest?: (selector: string) => unknown } | null;

/**
 * Ô số (type="number") đang được chọn sẽ tự cộng/trừ khi lăn chuột trên nó — dễ làm sai chỉ số
 * công tơ mà người nhập không để ý. Bỏ chọn ô ngay khi lăn để trang cuộn bình thường, số giữ nguyên.
 */
export function shouldBlurNumberInputOnWheel(target: WheelTarget, active: unknown): boolean {
  return Boolean(target && target === active && target.tagName === "INPUT" && target.type === "number"
    && target.closest?.(".ctktkt-content, .ctktkt-module"));
}

/** Áp dụng dán khối và phím điều hướng cho mọi ô nhập dữ liệu trong ứng dụng. */
export function SpreadsheetInputBehavior() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isSpreadsheetInput(event.target as Element)) return;
      const input = event.target as HTMLInputElement;
      const directions: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        Enter: event.shiftKey ? "up" : "down",
        Tab: event.shiftKey ? "left" : "right",
      };
      const direction = directions[event.key];
      if (!direction) return;
      const grid = gridOf(input);
      const rowIndex = grid.findIndex(row => row.includes(input));
      if (rowIndex < 0) return;
      const columnIndex = grid[rowIndex].indexOf(input);
      let target: HTMLInputElement | undefined;
      if (direction === "left") target = grid[rowIndex][columnIndex - 1] || grid[rowIndex - 1]?.at(-1);
      if (direction === "right") target = grid[rowIndex][columnIndex + 1] || grid[rowIndex + 1]?.[0];
      if (direction === "up" || direction === "down") {
        const nextRow = grid[rowIndex + (direction === "up" ? -1 : 1)];
        if (nextRow) {
          const currentLeft = input.getBoundingClientRect().left;
          target = [...nextRow].sort((a, b) => Math.abs(a.getBoundingClientRect().left - currentLeft) - Math.abs(b.getBoundingClientRect().left - currentLeft))[0];
        }
      }
      if (!target) return;
      event.preventDefault();
      focusAndSelect(target);
    };

    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || !isSpreadsheetInput(event.target as Element)) return;
      const text = event.clipboardData?.getData("text/plain") || "";
      const html = event.clipboardData?.getData("text/html") || "";
      if (!text.includes("\t") && !/[\r\n]/.test(text)) {
        const preciseValue = html ? parseSpreadsheetClipboard(text, html)[0]?.[0] : undefined;
        if (preciseValue === undefined || preciseValue === parseSpreadsheetClipboard(text)[0]?.[0]) return;
        event.preventDefault();
        setReactInputValue(event.target as HTMLInputElement, preciseValue);
        return;
      }
      const matrix = parseSpreadsheetClipboard(text, html);
      if (!matrix.length) return;
      const input = event.target as HTMLInputElement;
      const grid = gridOf(input);
      const rowIndex = grid.findIndex(row => row.includes(input));
      if (rowIndex < 0) return;
      const columnIndex = grid[rowIndex].indexOf(input);
      event.preventDefault();
      let last: HTMLInputElement | undefined;
      matrix.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
        const target = grid[rowIndex + rowOffset]?.[columnIndex + columnOffset];
        if (!target) return;
        setReactInputValue(target, value);
        last = target;
      }));
      focusAndSelect(last || input);
    };

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLInputElement | null;
      if (shouldBlurNumberInputOnWheel(target, document.activeElement)) target?.blur();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("paste", onPaste);
    // passive: không chặn cuộn trang; capture: chạy trước khi trình duyệt đổi giá trị ô số.
    document.addEventListener("wheel", onWheel, { passive: true, capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, []);

  return null;
}
