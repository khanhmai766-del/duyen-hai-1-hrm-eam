# Notes for certification – Cấp số PCT NKVH 1.0.0

Dán nguyên phần dưới vào ô **Notes for certification** khi bấm Submit.
(Đội duyệt của Microsoft đọc tiếng Anh nên để tiếng Anh.)

---

This is an internal productivity extension for operators of Operation Workshop 1 (PXVH1), Duyen Hai 1 Thermal Power Plant, Vietnam. It is published as a Hidden listing for internal staff only.

Purpose: when an operator issues an internal electronic work permit (PCT) in the plant's operation-log system NKVH (nkvh.tpcduyenhai.com.vn), the permit number must come from the workshop's permit register at duyenhai1.vn so electronic and paper permits share one number sequence. The extension adds a "Lấy số PCT" (Get permit number) button next to the "Số phiếu" (permit number) field on the NKVH permit detail page.

How it works:
1. The content script runs only on the two NKVH permit detail pages (pctc_ct, pctd_ct). It reads the permit fields visible on the page (work registration number, team, classification, location, content, scope, planned times, names of the issuer/commander/leader, worker count) and the permit id from the page URL.
2. When the user clicks the button and chooses the generator unit and position, the service worker sends that data over HTTPS to https://duyenhai1.vn/api/work-permits/nkvh-claim, using the user's existing duyenhai1.vn login session. The server issues the next permit number and records the permit in the register.
3. The extension writes the returned number into the single "Số phiếu" input on the NKVH page. It never clicks Save, never signs and never changes any other field; the user reviews the page and saves it themselves.
4. "Đồng bộ về sổ" (Sync to register) re-sends the page fields to update the register entry.

Data handling: no passwords, cookies or tokens are read or transmitted by the extension. No browsing history, analytics, ads or remote code. chrome.storage.local only stores two UI preferences (chosen server and last chosen position). The only hosts accessed are nkvh.tpcduyenhai.com.vn (content script) and duyenhai1.vn (API).

Testing: NKVH is only reachable from the plant's internal network and duyenhai1.vn accounts are issued to plant staff, so we cannot provide a public test account. The packaged source is not minified or obfuscated; content.js contains the full page-reading and field-filling logic. Privacy policy: https://duyenhai1.vn/public/nkvh-pct-privacy
