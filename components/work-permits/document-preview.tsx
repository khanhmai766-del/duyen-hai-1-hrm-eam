"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { workPermitQrPrintImage } from "@/lib/work-permit-qr";

type PermitDocumentFile = { blob: Blob; filename: string };

/**
 * Các chỗ docx-preview hiển thị khác Word; chỉ sửa bản xem, file Word tải về giữ nguyên:
 * - Gắn phông docDefaults (Calibri theo theme) thẳng vào từng `span`, đè Times New Roman mà đoạn
 *   thừa hưởng từ kiểu Normal. Word ưu tiên kiểu Normal → chép rFonts của Normal sang docDefaults.
 * - Dùng cả phông `eastAsia` (mẫu có "MS Mincho") cho chữ Việt, làm vỡ dấu. Word chỉ dùng phông
 *   này cho chữ Á Đông → bỏ thuộc tính eastAsia khỏi mọi rFonts.
 * - Đọc thụt lề bảng `tblInd` theo thuộc tính `left` thay vì `w`, nên bỏ qua (bảng đầu phiếu mẫu Cơ
 *   thụt âm ra lề trái bị lệch phải) → chép `w` sang `left`.
 */
async function wordXmlForPreview(blob: Blob) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(blob);
  const fixXml = (xml: string) => xml.replace(/<w:rFonts\b[^>]*\/>/g, tag => tag.replace(/\s+w:eastAsia(?:Theme)?="[^"]*"/g, ""))
    .replace(/<w:tblInd\b(?=[^>]*w:type="dxa")(?![^>]*w:left=)([^>]*?)w:w="(-?\d+)"([^>]*)\/>/g, '<w:tblInd$1w:w="$2" w:left="$2"$3/>');
  for (const part of zip.file(/^word\/(document|styles|header\d*|footer\d*)\.xml$/)) {
    let xml = await part.async("string");
    if (part.name === "word/styles.xml") {
      const normal = xml.match(/<w:style\b(?=[^>]*w:type="paragraph")(?=[^>]*w:default="1")[^>]*>[\s\S]*?<\/w:style>/)?.[0];
      const fonts = normal?.match(/<w:rPr>[\s\S]*?(<w:rFonts\b[^>]*\/>)/)?.[1];
      if (fonts) xml = xml.replace(/(<w:rPrDefault>[\s\S]*?)<w:rFonts\b[^>]*\/>/, `$1${fonts}`);
    }
    zip.file(part.name, fixXml(xml));
  }
  const svg = zip.file("word/media/work-permit-qr.svg");
  const qr = zip.file("word/footer-overhaul-qr.xml") ? svg ?? zip.file("word/media/work-permit-qr.png") : null;
  return { blob: await zip.generateAsync({ type: "blob" }), qrSrc: qr ? `data:image/${svg ? "svg+xml" : "png"};base64,${await qr.async("base64")}` : undefined };
}

/**
 * In theo khổ và lề của chính mẫu Word: docx-preview ghi khổ giấy/lề vào style của `section.docx`.
 * Lề trên/dưới chuyển sang @page để trang nào cũng đủ lề khi trình duyệt tự ngắt trang; lề trái/phải
 * giữ bằng padding vì mẫu có đoạn thụt âm và bảng tràn ra ngoài lề, đặt vào @page sẽ bị cắt mất.
 */
function addPrintStyle(doc: Document, qrSrc?: string) {
  const page = doc.querySelector<HTMLElement>("section.docx")?.style;
  const size = page?.width && page.minHeight ? `size: ${page.width} ${page.minHeight};` : "";
  const style = doc.createElement("style");
  if (qrSrc) {
    const footer = doc.querySelector("section.docx > footer");
    footer?.setAttribute("data-overhaul-qr", "true");
    footer?.querySelector("img")?.setAttribute("src", qrSrc);
  }
  style.textContent = `@media print {
  @page { ${size} margin: ${page?.paddingTop || 0} 0 ${page?.paddingBottom || 0} 0; }
  html, body { margin: 0; background: none; }
  .docx-wrapper { background: none !important; padding: 0 !important; display: block !important; }
  .docx-wrapper > section.docx { box-shadow: none !important; margin: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; min-height: 0 !important; break-after: page; }
  .docx-wrapper > section.docx:last-child { break-after: auto; }
  ${qrSrc ? `footer[data-overhaul-qr] { display:none !important; }
  @page:first { @bottom-right { content:url("${workPermitQrPrintImage(qrSrc)}");text-align:right;vertical-align:bottom;padding-right:${page?.paddingRight || "20mm"};padding-bottom:5mm; } }` : ""}
}`;
  doc.head.appendChild(style);
}

/**
 * Hiện PCT đã điền đúng như mẫu Word gốc ngay trong trình duyệt để rà soát rồi in.
 * Vẽ trong iframe để CSS của ứng dụng (Tailwind preflight) không làm lệch bố cục mẫu.
 */
/** `viewOnly`: chỉ xem (Xem mẫu in trong form cập nhật — dữ liệu chưa lưu), không Tải Word / Tải QR / In. */
export function PermitDocumentPreview({ title, load, loadQr, onClose, viewOnly = false }: { title: string; load: () => Promise<PermitDocumentFile>; loadQr?: () => Promise<PermitDocumentFile>; onClose: () => void; viewOnly?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const loadRef = useRef(load);
  const [file, setFile] = useState<PermitDocumentFile | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);

  useEffect(() => {
    let alive = true;
    loadRef.current().then(result => { if (alive) setFile(result); }, (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Không thể điền mẫu PCT"); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!file || !doc) return;
    let alive = true;
    let qrSrc: string | undefined;
    doc.open(); doc.write("<!doctype html><html><head></head><body></body></html>"); doc.close();
    Promise.all([import("docx-preview"), wordXmlForPreview(file.blob)])
      .then(([{ renderAsync }, prepared]) => {
        qrSrc = prepared.qrSrc;
        return renderAsync(prepared.blob, doc.body, doc.head, { inWrapper: true, ignoreLastRenderedPageBreak: true, breakPages: true, useBase64URL: true });
      })
      .then(() => {
        if (!alive) return;
        doc.title = file.filename.replace(/\.docx$/i, "");
        addPrintStyle(doc, qrSrc);
        setReady(true);
      })
      .catch(() => { if (alive) setError("Không hiển thị được mẫu Word. Vui lòng tải file Word để xem."); });
    return () => { alive = false; };
  }, [file]);

  function saveFile(value: PermitDocumentFile) {
    const url = URL.createObjectURL(value.blob), a = document.createElement("a");
    a.href = url; a.download = value.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadQr() {
    if (!loadQr || downloadingQr) return;
    setDownloadingQr(true);
    try { saveFile(await loadQr()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể tải mã QR"); }
    finally { setDownloadingQr(false); }
  }
  function print() {
    const win = frame.current?.contentWindow;
    if (!win) return toast.error("Chưa sẵn sàng để in");
    win.focus(); win.print();
  }

  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
    <DialogContent className="flex h-[92dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 pr-12">
        <div className="min-w-0">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{viewOnly ? "Chỉ để xem theo đúng mẫu Word của phiếu. Lưu phiếu rồi mở Xem và in để tải hoặc in." : "Bản xem theo đúng mẫu Word của phiếu. Rà soát thông tin trước khi in hoặc cấp phiếu."}</DialogDescription>
        </div>
        {!viewOnly && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-10 text-xs sm:h-8" disabled={!file} onClick={() => { if (file) saveFile(file); }}><Download />Tải Word</Button>
          {loadQr && <Button size="sm" variant="outline" className="h-10 text-xs sm:h-8" disabled={downloadingQr} onClick={() => void downloadQr()} title="Tải ảnh mã QR riêng để in dán lên phiếu đã cấp"><QrCode />{downloadingQr ? "Đang tải…" : "Tải QR"}</Button>}
          <Button size="sm" className="h-10 text-xs sm:h-8" disabled={!ready} onClick={print}><Printer />In</Button>
        </div>}
      </div>
      <div className="relative min-h-0 flex-1 bg-muted">
        {!ready && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">{error || "Đang điền mẫu…"}</p>}
        <iframe ref={frame} title={title} className={`h-full w-full border-0 ${ready ? "" : "invisible"}`} />
      </div>
    </DialogContent>
  </Dialog>;
}
