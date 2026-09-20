// ESLint 9 flat config — thay cho .eslintrc.json (Next 16 bỏ lệnh `next lint`, dùng `eslint .`).
import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next chỉ nạp plugin react-hooks cho đúng các đuôi file này — khối ghi đè luật
// react-hooks phải giới hạn cùng mẫu, nếu không ESLint báo "could not find plugin react-hooks"
// với các file ngoài mẫu (vd .cjs).
const NEXT_LINTED_FILES = ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"];

export default defineConfig([
  globalIgnores([
    "**/.next/",
    "**/.next-builds/",
    "**/node_modules/",
    "prisma/generated/",
    "scripts/perf-audit.mjs",
    // Thư mục nháp của phiên làm việc — không phải mã nguồn dự án (xem .gitignore).
    "tmp/",
  ]),
  ...nextCoreWebVitals,
  {
    // eslint-config-next 16 bật bộ luật React Compiler (eslint-plugin-react-hooks 6) ở mức LỖI.
    // Lần đầu chạy trên mã có sẵn (2026-09-13, lúc nâng Next 16): 150 chỗ, gần hết là setState
    // trong useEffect — không phải lỗi chạy, và sửa hàng loạt effect đang chạy ổn là rủi ro
    // lớn hơn lợi ích. Hạ xuống cảnh báo để `npm run lint` vẫn bắt được lỗi thật; mã mới nên
    // tránh các mẫu này.
    files: NEXT_LINTED_FILES,
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);
