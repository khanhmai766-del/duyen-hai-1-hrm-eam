"use client";

import { useEffect, useRef, useState } from "react";

type Props = { operatingDate: string; disabled?: boolean; onApply: (s1: string, s2: string) => void };
const channel = "ctktkt-nkvh-ppa";

export function NkvhPpaSyncButton({ operatingDate, disabled, onApply }: Props) {
  const [status, setStatus] = useState("");
  const [opening, setOpening] = useState(false);
  const request = useRef<{ id: string; date: string; timer: number } | null>(null);
  const current = useRef({ operatingDate, disabled, onApply });
  useEffect(() => {
    current.current = { operatingDate, disabled, onApply };
  }, [operatingDate, disabled, onApply]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      const pending = request.current;
      if (!pending || data?.channel !== channel || data.sender !== "nkvh-extension" || data.requestId !== pending.id) return;
      if (data.type === "OPENED") {
        window.clearTimeout(pending.timer); setOpening(false);
        setStatus(data.ok ? "Đã mở trang chọn sự kiện NKVH. Tick dữ liệu rồi bấm Đưa vào web." : String(data.error || "Không mở được tiện ích."));
        if (!data.ok) request.current = null;
      }
      if (data.type === "APPLY") {
        if (data.operatingDate !== pending.date || pending.date !== current.current.operatingDate || current.current.disabled) {
          setStatus("Ngày hoặc quyền chỉnh sửa đã thay đổi. Hãy đồng bộ lại cho ngày đang chọn.");
          request.current = null; return;
        }
        if (typeof data.eventS1 !== "string" || typeof data.eventS2 !== "string" || data.eventS1.length > 1000 || data.eventS2.length > 1000) {
          setStatus("Nội dung nhận không hợp lệ hoặc vượt 1.000 ký tự/tổ máy."); return;
        }
        current.current.onApply(data.eventS1, data.eventS2);
        setStatus("Đã điền nội dung S1/S2 có lựa chọn. Kiểm tra rồi bấm Lưu thông tin S1/S2.");
        request.current = null;
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      if (request.current) window.clearTimeout(request.current.timer);
    };
  }, []);

  const sync = () => {
    if (request.current) window.clearTimeout(request.current.timer);
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      setOpening(false); request.current = null;
      setStatus("Chưa kết nối tiện ích NKVH. Cài/cập nhật bản 0.2.0 rồi tải lại trang web.");
    }, 5000);
    request.current = { id, date: operatingDate, timer };
    setOpening(true); setStatus("");
    window.postMessage({ channel, sender: "ctktkt-web", type: "OPEN", requestId: id, operatingDate }, window.location.origin);
  };

  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
    <button type="button" onClick={sync} disabled={disabled || opening}
      className="rounded-lg bg-[#4057b5] px-3 py-1.5 font-bold text-white hover:bg-[#30459a] disabled:opacity-50">
      {opening ? "Đang mở…" : "Đồng bộ NKVH S1 + S2"}
    </button>
    <a href="/ctktkt/nkvh-ppa-extension.zip" className="text-[#4057b5] underline">Tải tiện ích NKVH</a>
    <span role="status" className="text-slate-600">{status}</span>
  </div>;
}
