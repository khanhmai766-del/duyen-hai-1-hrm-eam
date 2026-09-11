import Link from "next/link";


export default function ContractNotFound() {
  return (
    <div className="min-h-full bg-slate-100">
      

      <div className="flex">
        

        <main className="flex min-h-[calc(100vh-52px)] min-w-0 flex-1 items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-xl font-bold text-amber-600">
              !
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-900">
              Không tìm thấy hợp đồng
            </h1>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Hợp đồng có thể đã bị xóa, đổi mã hoặc đường dẫn không còn chính xác.
            </p>
            <Link
              href="/documents/contracts/list"
              className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-blue-700 px-4 text-[11px] font-semibold text-white hover:bg-blue-800"
            >
              Quay lại danh sách hợp đồng
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
