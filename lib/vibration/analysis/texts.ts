// Văn bản nghiệp vụ phân tích rung — chép nguyên từ vibracontrol/vibration-analysis.js (dòng 12–66, 398, 511):
// LEVELS, LEVEL_ACTIONS, FAN_ACTIONS, ZONE_LEVEL, STD_SHORT, HYPOTHESES (H0–H14), CAUSE_ACTIONS, DEADLINE, QN. Không sửa chữ ở đây.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Level = "na" | "normal" | "watch" | "plan" | "soon" | "stop";
export const LEVELS: Record<Level, { rank: number; label: string }>={na:{rank:0,label:'Không đánh giá'},normal:{rank:1,label:'Bình thường'},watch:{rank:2,label:'Theo dõi'},plan:{rank:3,label:'Lên kế hoạch sửa'},soon:{rank:4,label:'Sửa sớm nhất'},stop:{rank:5,label:'Dừng máy (khuyến cáo)'}};
export const LEVEL_ACTIONS: any={
  normal:['Duy trì bảo dưỡng định kỳ (tra mỡ, thay dầu, vệ sinh, siết bu-lông); không sửa khi không cần.','[R1 §6.2.2] · [SCCN-T4 thang mức 1]'],
  watch:['Tìm nguyên nhân (đo phổ, pha, nhiệt); rút ngắn chu kỳ đo.','[R1 §6.3] · [SCCN-T4 thang mức 2]'],
  plan:['Chuẩn bị vật tư, sửa ở lần dừng thuận lợi; trong lúc chờ áp dụng biện pháp tạm theo nguyên nhân (HD mục 8.2).','[R1 §6.2.2] · [SCCN-T4 thang mức 3]'],
  soon:['Báo người có thẩm quyền; chuẩn bị dừng; giảm tải nếu được.','[R1 §6.2.2, §6.5.2] · [WOWK tr.9] · [SCCN-T4 thang mức 4]'],
  stop:['Giảm rung ngay hoặc dừng máy.','[R1 §6.5.3]']
};
export const FAN_ACTIONS: any=[
  'Dưới mức khởi động: đạt yêu cầu của quạt mới / vừa sửa.',
  'Từ khởi động đến cảnh báo: rung tăng dần theo thời gian là bình thường, miễn chưa tới mức cảnh báo; theo dõi.',
  'Tới mức cảnh báo: bắt đầu ngay việc tìm nguyên nhân và khắc phục; theo dõi sát; chỉ vận hành trong thời gian tối thiểu để chuẩn bị sửa.',
  'Tới mức dừng: khắc phục ngay hoặc dừng quạt; kéo dài có thể hỏng ổ, nứt rô-to, nứt mối hàn vỏ.'
];
export const FAN_LEVEL: any = ['normal', 'watch', 'soon', 'stop'];
export const ZONE_LEVEL: any = { A: 'normal', B: 'normal', C: 'plan', D: 'soon' };
export const FAN_MUC_TEXT: any={duoi_khoi_dong:'Dưới mức khởi động',khoi_dong_den_canh_bao:'Khởi động → cảnh báo',canh_bao_den_dung:'Cảnh báo → dừng',vuot_dung:'Vượt mức dừng'};
export const STD_SHORT: any={ISO_20816_3_2022:'ISO 20816-3:2022',ISO_10816_7_2009:'ISO 10816-7:2009',ISO_14694_2003_AMCA_204_20:'ISO 14694:2003 / AMCA 204-20',ISO_20816_2_2017:'ISO 20816-2:2017',IEC_60034_14_2018:'IEC 60034-14:2018'};
// Giả thuyết tầng 1 (đặc tả 6.1) + xử lý HD mục 8.2. Mọi nguồn lấy từ bảng HD mục 1.3.
export const HYPOTHESES: any={
  H0:{name:'Sai lệch phép đo / nhập liệu — loại trừ trước tiên',src:'[WOWK tr.5]',check:'Đo lại; người khác đo bằng thiết bị khác [WOWK tr.5].',acts:['0']},
  H1:{name:'Mất cân bằng',src:'[WOWK tr.7] · [R6 tr.9]',check:'Thử một phát đối trọng [WOWK tr.6]; đo phổ xác nhận 1X trội, pha lệch 90° ngang→đứng [R6 tr.12–13].',acts:['1']},
  H2:{name:'Lệch đồng tâm khớp nối (cần đo dọc trục)',src:'[WOWK tr.7] · [R6 tr.9, tr.15]',check:'Đo rung dọc trục và pha hai bên khớp nối [R6 tr.15]; căn tâm bằng đồ gá đo trục [WOWK tr.6]; đo lúc nguội và lúc nóng [WOWK tr.9].',acts:['2']},
  H3:{name:'Cộng hưởng / chân mềm / lỏng',src:'[WOWK tr.2, tr.7] · [R6 tr.9, tr.19]',check:'Nới lần lượt từng bu-lông chân và đo lại [WOWK tr.7]; gõ búa, ghi khởi động/dừng để tìm tần số riêng [WOWK tr.2].',acts:['7','5','6']},
  H4:{name:'Có thành phần hài / tần số cao (lỏng, vòng bi)',src:'[DOC mục 6] · [WOWK tr.7]',check:'Đo phổ vận tốc và phổ bao hình gE [R6 tr.22–24].',acts:['6','8']},
  H5:{name:'Bôi trơn / ổ lăn',src:'[WOWK tr.9, tr.10] · [SCCN-T4 định nghĩa gE]',check:'Tái bôi trơn rồi đo lại [SCCN-T4 mục 5]; đo gE, nghe ổ, theo dõi nhiệt [WOWK tr.6].',acts:['9','8']},
  H7:{name:'Rung truyền từ nguồn bên ngoài (rung nền lớn)',src:'[R1 §1, §4.6] · [WOWK tr.9]',check:'Đo rung khi máy dừng (cùng vị trí, phương); nếu > min(25 % rung chạy; 25 % B/C) thì xử lý nguồn rung ngoài trước khi đánh giá máy [R1 §4.6].',acts:['15']},
  H6:{name:'Điều kiện vận hành',src:'[WOWK tr.9] · [R1 §4.5]',check:'Đo lại ở cùng điều kiện vận hành ổn định, cùng vị trí và phương đo [R1 §4.5, §6.3].',acts:['17']},
  // --- Suy từ phân bố và lịch sử số liệu (bổ sung 02/10/2026) ---
  H8:{name:'Nguồn rung ở phía động cơ',src:'[WOWK tr.9 — dòng năng lượng rung] · [WOWK tr.7 Bảng 3]',check:'So rung khi có tải và lúc cắt điện (coast-down): mất ngay khi cắt điện → nguồn điện từ; giảm dần theo tốc độ → cơ khí rô-to động cơ (mất cân bằng, ổ). Kiểm tra quạt làm mát, bu-lông chân động cơ.',acts:['18','1','8']},
  H9:{name:'Nguồn rung ở phía máy công tác (bơm / quạt)',src:'[WOWK tr.9 — dòng năng lượng rung] · [R5]',check:'So rung với lưu lượng, độ mở van / cửa gió; nghe tiếng xâm thực; kiểm tra bám bẩn, mòn cánh, tắc lọc / ống hút; so với máy cùng loại đang chạy.',acts:['19','1','8']},
  H10:{name:'Rung tăng dần theo thời gian (suy giảm tình trạng)',src:'[WOWK tr.8–9 — tốc độ thay đổi] · [R1 §6.3]',check:'Xác nhận xu hướng bằng các lần đo cùng điều kiện; đo phổ / gE để tìm bộ phận đang mòn (ổ, khớp nối, cánh bám bẩn); lập kế hoạch trước ngày dự báo chạm ngưỡng.',acts:['20','9','8']},
  H11:{name:'Biên độ dao động thất thường (lên xuống giữa các lần đo)',src:'[WOWK tr.2 — dấu hiệu cộng hưởng] · [WOWK tr.5 — lặp lại phép đo]',check:'Trước hết loại trừ sai điểm đo / đảo cột; nếu số đo lặp lại được: ghi rung theo thời gian liên tục, khởi động–dừng, gõ búa tìm tần số riêng; kiểm tra phách với máy chạy cạnh.',acts:['25','7','6']},
  H12:{name:'Số đo phụ thuộc người đo (cách đo chưa thống nhất)',src:'[WOWK tr.4–5] · [R1 §4.2]',check:'Hai người đo cùng một điểm trong cùng ca, cùng máy đo; đánh dấu cố định điểm đo, hướng cảm biến, dùng đế từ phẳng.',acts:['25','0']},
  H13:{name:'Lệch dòng 3 pha kéo dài (điện nguồn / động cơ)',src:'[WOWK tr.7 Bảng 3 — điện động cơ] · [WOWK tr.9 — điều kiện vận hành]',check:'Đo điện áp 3 pha tại tủ, kiểm tra tiếp xúc đầu cốt / contactor, điện trở cách điện và điện trở cuộn dây; nếu đo được phổ: tìm 2 × tần số lưới (100 Hz).',acts:['18']},
  H14:{name:'Nhiệt gối tăng nhưng rung không tăng (bôi trơn / làm mát / tải)',src:'[WOWK tr.9 — nhiệt gối tăng phải hành động ngay] · [SCCN-T4]',check:'Kiểm tra loại và lượng mỡ / mức dầu, thời điểm tra mỡ gần nhất, quạt / nước làm mát, căng đai hoặc lệch tâm gây tải ổ; đo gE nếu có.',acts:['22','9']}
};
export const CAUSE_ACTIONS: any={
  '0':['Lỗi đo / nhiễu','Chưa can thiệp máy.','Kiểm tra cáp, gá cảm biến; đo lại; người khác đo bằng thiết bị khác.','Số liệu lặp lại được.','[WOWK tr.5]'],
  '1':['Mất cân bằng','Giảm tải/tốc độ nếu công nghệ cho phép; theo dõi.','Vệ sinh cánh/rô-to trước → cân bằng động tại chỗ; mất cân bằng dư ≤ U_per = 9549·G·m/n (động cơ G2,5; quạt, máy công nghệ G6,3).','1X giảm; tổng về vùng A/B, nghiệm thu ≤ 1,25 × A/B [R1 §6.2.3].','[WOWK tr.9] · [R4 mục 5.5.1.2] · [R26]'],
  '2':['Lệch đồng tâm','Theo dõi nhiệt khớp nối và ổ; tránh đổi tải đột ngột.','Xử lý chân mềm trước, rồi căn tâm lại bằng laser/đồng hồ so theo dung sai phụ thuộc tốc độ; tính giãn nở nhiệt; kiểm tra lại sau khi siết ống.','Pha dọc trục qua khớp nối hết lệch 180°; 2X và dọc trục giảm.','[R18] · [R20] · [R19] · [WOWK tr.6, tr.9] · [R6 tr.15]'],
  '5':['Chân mềm / bệ yếu','Siết đúng lực, kiểm tra nứt bệ.','Kiểm tra chân mềm khi đã tháo đường ống (mỗi chân ≤ 0,05 mm); căn đệm đúng quy cách; sửa bệ, vữa chèn.','Nới từng bu-lông không làm rung thay đổi đáng kể.','[R19] · [WOWK tr.7]'],
  '6':['Lỏng cơ khí','Siết bu-lông chân, nắp ổ, bệ.','Kiểm tra khe hở lắp ghép ổ/trục/vỏ; thay chi tiết mòn; sửa mối ghép kết cấu.','Hết ½X, 1½X…; pha ổn định.','[WOWK tr.7, tr.10] · [R6 tr.19]'],
  '7':['Cộng hưởng','Tránh vận hành ở tốc độ/chế độ gây cộng hưởng.','Xác định tần số riêng trước (gõ búa, ODS); đổi tốc độ, đổi tần số riêng, thêm giảm chấn, giảm nguồn kích thích hoặc bộ hấp thụ động lực. Bơm: kiểm tra cộng hưởng đường ống.','Tần số riêng cao hơn tần số kích thích ≥ 25 % (tiêu chí bệ cứng R1 §5.3).','[WOWK tr.2–3] · [PXVH1 mục 3] · [R1 §5.3]'],
  '8':['Hư ổ lăn','Tra mỡ hằng ngày; theo dõi nhiệt, gE, tiếng ồn; chuẩn bị ổ thay.','Thay ổ và xử lý nguyên nhân (lệch tâm, mất cân bằng, bôi trơn, lắp sai, dòng điện qua ổ); lắp đúng kỹ thuật.','gE về mức nền; không còn tần số hư hỏng.','[WOWK tr.8, tr.10] · [R6 phần mở đầu; tr.21]'],
  '9':['Bôi trơn kém','Tra đúng loại, đúng lượng mỡ/dầu.','Chuẩn hoá chu kỳ và lượng bôi trơn; kiểm tra nhiễm bẩn; cả thiếu lẫn thừa mỡ đều gây gE cao.','gE giảm sau tái bôi trơn.','[SCCN-T4 định nghĩa gE; mục 5] · [WOWK tr.10]'],
  '15':['Rung truyền từ cụm lân cận / nền','—','Xử lý tại nguồn rung; cách ly (gối đàn hồi, tách bệ) nếu cần.','Rung khi máy dừng ≤ min(25 % rung khi chạy; 25 % B/C).','[R1 §4.6] · [WOWK tr.9]'],
  '17':['Điều kiện vận hành','Đo lại đúng điều kiện ổn định.','Điều chỉnh chế độ vận hành.','Rung ổn định ở chế độ định mức.','[WOWK tr.9] · [R1 §4.5]'],
  '18':['Điện / động cơ','Theo dõi dòng 3 pha, nhiệt vỏ và nhiệt cuộn dây; tránh khởi động lặp lại.','Cân bằng điện áp nguồn; xiết / thay tiếp điểm, đầu cốt; đo cách điện, điện trở cuộn dây; kiểm tra thanh dẫn rô-to, khe hở không khí; cân bằng rô-to động cơ nếu nguồn rung cơ khí.','Lệch dòng 3 pha ≤ 10 %; rung phía động cơ về mức nền.','[WOWK tr.7, tr.9–10]'],
  '19':['Thủy lực / khí động (bơm, quạt)','Đưa về gần điểm làm việc thiết kế; tránh lưu lượng thấp kéo dài; mở thông van / cửa gió nếu công nghệ cho phép.','Vệ sinh cánh bám bẩn; kiểm tra mòn cánh, vòng làm kín, khe hở; xử lý xâm thực (NPSH, ống hút, lọc); cân bằng lại cánh sau vệ sinh.','Rung ổn định và về mức nền ở chế độ định mức.','[R5] · [WOWK tr.7, tr.10]'],
  '20':['Suy giảm dần (mòn, bám bẩn, ổ)','Rút ngắn chu kỳ đo (hằng tuần → 2 lần/tuần); tra mỡ đúng định mức; chuẩn bị vật tư (ổ, phớt, khớp nối).','Kiểm tra — sửa ở lần dừng TRƯỚC ngày dự báo chạm ngưỡng; xác định bộ phận mòn bằng phổ / gE và kiểm tra trực quan khi dừng.','Rung về mức nền cũ; xu hướng phẳng trở lại.','[WOWK tr.8–9] · [R1 §6.3]'],
  '22':['Nhiệt ổ (bôi trơn, làm mát, tải)','Kiểm tra mỡ / dầu, làm mát; giảm tải nếu nhiệt tiếp tục tăng.','Chuẩn hoá loại, lượng, chu kỳ bôi trơn; xử lý nguyên nhân tăng tải lên ổ (lệch tâm, căng đai, giãn nở nhiệt); kiểm tra khe hở ổ.','Nhiệt gối về mức nền và ổn định.','[WOWK tr.9–10] · [SCCN-T4 mục 5]'],
  '25':['Chuẩn hoá phép đo','Đo lại ngay cùng điểm, cùng phương, cùng máy đo; ghi tên người đo.','Đánh dấu cố định điểm đo (sơn / đế dán), quy định hướng X/Y, dùng đế từ phẳng, cùng một máy đo; hướng dẫn lại người đo.','Hai người đo cùng điểm lệch ≤ 10 %; chuỗi số đo không còn nhảy lên xuống.','[WOWK tr.4–5] · [R1 §4.2]']
};
export const DEADLINE: any={stop:'Ngay lập tức',soon:'Trong ca / 24 giờ',plan:'Lần dừng thuận lợi gần nhất',watch:'Đo lại trong 3–7 ngày',normal:'Theo chu kỳ đo định kỳ'};
export const QN: any={Q1:'ô số bị lưu thành ngày/giờ hoặc không đọc được',Q4:'biên độ ghi theo mm lẫn µm',Q5:'nghi đảo cột vận tốc ↔ biên độ',Q6:'nghi thiếu dấu thập phân',Q10:'giá trị phi lý'};
