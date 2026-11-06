import { describe, it, expect } from 'vitest';
import { calcMargin, analyzeProduct, tierFor } from '@/lib/pricing';
import { approvalLevel, levelByValue, canApprove } from '@/lib/approval';
import { trustScore } from '@/lib/trust';
import { workingCapital } from '@/lib/capital';

describe('calcMargin', () => {
  it('28k bán 35k: biên 11,6% (VAT = giá × 8/108)', () => {
    const b = calcMargin({ revenue: 35000, cost: 28000 });
    expect(b.vatOut).toBe(2593);
    expect(b.bankFee).toBe(350);
    expect(b.net).toBe(3246);
    expect(b.marginOnCost).toBeCloseTo(11.59, 1);
  });
  it('VAT đầu vào làm giảm chi phí thực', () => {
    const a = calcMargin({ revenue: 130000, cost: 44000 });
    const b = calcMargin({ revenue: 130000, cost: 44000, inputVat: 3000 });
    expect(b.costNet).toBe(41000);
    expect(b.net).toBeGreaterThan(a.net);
  });
  it('lỗ thì không tính TNDN', () => {
    const b = calcMargin({ revenue: 20000, cost: 28000 });
    expect(b.cit).toBe(0);
    expect(b.net).toBeLessThan(0);
  });
  it('phí kênh cộng vào chi phí', () => {
    const b = calcMargin({ revenue: 100000, cost: 50000, channelFeePct: 10 });
    expect(b.channelFee).toBe(10000);
    expect(b.costNet).toBe(60000);
  });
  it('từ chối đầu vào sai', () => {
    expect(() => calcMargin({ revenue: 0, cost: 1 })).toThrow();
    expect(() => calcMargin({ revenue: 10, cost: 10, inputVat: 10 })).toThrow();
  });
});

describe('approvalLevel', () => {
  it('theo giá trị đơn', () => {
    expect(levelByValue(4_999_999)).toBe(1);
    expect(levelByValue(5_000_000)).toBe(2);
    expect(levelByValue(20_000_000)).toBe(3);
    expect(levelByValue(50_000_000)).toBe(4);
    expect(levelByValue(200_000_000)).toBe(4);
    expect(levelByValue(200_000_001)).toBe(5);
  });
  it('biên dưới 15% tối thiểu Cấp 2', () => {
    expect(approvalLevel(1_000_000, 11.6, 100).level).toBe(2);
  });
  it('đơn lỗ tối thiểu Cấp 4', () => {
    expect(approvalLevel(1_000_000, -5, -100).level).toBe(4);
  });
  it('biên cao không làm tăng cấp', () => {
    expect(approvalLevel(1_000_000, 140, 100).level).toBe(1);
  });
  it('quyền duyệt', () => {
    expect(canApprove('TRUONG_NHOM', 2)).toBe(true);
    expect(canApprove('TRUONG_NHOM', 3)).toBe(false);
    expect(canApprove('CEO', 5)).toBe(true);
    expect(canApprove('KE_TOAN', 2)).toBe(false);
  });
});

describe('analyzeProduct', () => {
  it('cảnh báo biên > 150%', () => {
    const a = analyzeProduct({ cost: 10000, fee: 0, input_vat: 0, price_taomua_10: 50000, price_taomua_50: 40000, price_taomua_100: 30000, price_taomua_500: 20000 });
    expect(a.warnings.some((w) => w.includes('Bậc 10'))).toBe(true);
    expect(a.warnings.some((w) => w.includes('Bậc 500'))).toBe(false);
  });
  it('bậc theo số lượng', () => {
    expect(tierFor(9)).toBeNull();
    expect(tierFor(10)).toBe(10);
    expect(tierFor(499)).toBe(100);
    expect(tierFor(500)).toBe(500);
  });
});

describe('trustScore & vốn', () => {
  it('xưởng tốt đạt 100', () => {
    expect(trustScore({ response_time_sec: 60, verified_cert: true, defect_rate: 0, on_time_rate: 1, inventory_sync: true }).score).toBe(100);
  });
  it('vốn 45%', () => {
    const w = workingCapital(1_000_000_000, 400_000_000, 30);
    expect(w.total).toBe(450_000_000);
    expect(w.status).toBe('WARNING');
    expect(workingCapital(1e9, 200_000_000, 30).status).toBe('DANGER');
  });
});

describe('chi tiền & nút Tắt/Mở', async () => {
  const { DEFAULT_CONTROLS, payoutBlock, autoApprovePayout, payoutApproveError, needsReauth, payoutLevel } = await import('@/lib/payouts');
  const M = 1_000_000;
  it('mặc định: chưa khóa gì, khóa nhập mới đang tắt', () => {
    expect(DEFAULT_CONTROLS.AI_AUTO).toBe(true);
    expect(DEFAULT_CONTROLS.KHOA_NHAP_MOI).toBe(false);
    expect(payoutBlock('DAT_COC_XUONG', DEFAULT_CONTROLS)).toBeNull();
  });
  it('tắt một loại thì khóa đúng loại đó', () => {
    const ctl = { ...DEFAULT_CONTROLS, NAP_ADS: false };
    expect(payoutBlock('NAP_ADS', ctl)).toMatch(/khóa/);
    expect(payoutBlock('NAP_AI', ctl)).toBeNull();
  });
  it('khóa nhập mới chặn đặt cọc xưởng và mua mẫu, không chặn nộp thuế', () => {
    const ctl = { ...DEFAULT_CONTROLS, KHOA_NHAP_MOI: true };
    expect(payoutBlock('DAT_COC_XUONG', ctl)).not.toBeNull();
    expect(payoutBlock('MUA_MAU_LATR', ctl)).not.toBeNull();
    expect(payoutBlock('NOP_THUE', ctl)).toBeNull();
  });
  it('tự duyệt chỉ dưới 5 triệu, khi nút tổng bật, không áp cho loại Khác', () => {
    expect(autoApprovePayout(4_999_999, 'NAP_AI', DEFAULT_CONTROLS)).toBe(true);
    expect(autoApprovePayout(5 * M, 'NAP_AI', DEFAULT_CONTROLS)).toBe(false);
    expect(autoApprovePayout(1 * M, 'KHAC', DEFAULT_CONTROLS)).toBe(false);
    expect(autoApprovePayout(1 * M, 'NAP_AI', { ...DEFAULT_CONTROLS, AI_AUTO: false })).toBe(false);
    expect(autoApprovePayout(1 * M, 'NAP_AI', { ...DEFAULT_CONTROLS, NAP_AI: false })).toBe(false);
  });
  it('trưởng nhóm duyệt đến 20 triệu, không tự duyệt khoản mình đề xuất', () => {
    const lead = { id: 'L', role: 'TRUONG_NHOM' };
    expect(payoutApproveError(lead, { amount: 15 * M, proposed_by: 'X' })).toBeNull();
    expect(payoutApproveError(lead, { amount: 15 * M, proposed_by: 'L' })).not.toBeNull();
    expect(payoutApproveError(lead, { amount: 20 * M, proposed_by: 'X' })).not.toBeNull();
    expect(payoutApproveError({ id: 'C', role: 'CEO' }, { amount: 300 * M, proposed_by: 'C' })).toBeNull();
    expect(payoutApproveError({ id: 'K', role: 'KE_TOAN' }, { amount: 1 * M, proposed_by: 'X' })).not.toBeNull();
  });
  it('từ 10 triệu phải nhập lại mật khẩu; cấp theo số tiền', () => {
    expect(needsReauth(9_999_999)).toBe(false);
    expect(needsReauth(10 * M)).toBe(true);
    expect(payoutLevel(250 * M)).toBe(5);
  });
});

describe('quy tắc 7 agent', async () => {
  const R = await import('@/lib/agents/rules');
  const base = { cost: 13000, fee: 4000, input_vat: 0, prices: { 10: 24000, 50: 22000, 100: 21000, 500: 19500 } as any };
  it('priceForMargin: giá thấp nhất đạt 15%, làm tròn 500 đ', () => {
    const p = R.priceForMargin(17000, 0);
    expect(p % 500).toBe(0);
    expect(calcMargin({ revenue: p, cost: 17000 }).marginOnCost).toBeGreaterThanOrEqual(15);
    expect(calcMargin({ revenue: p - 500, cost: 17000 }).marginOnCost).toBeLessThan(15);
  });
  it('raiseToFloor nâng bậc thấp, giữ thứ tự mua nhiều rẻ hơn', () => {
    const n = R.raiseToFloor(base)!;
    expect(n[500]).toBeGreaterThan(19500);
    expect(n[10] >= n[50] && n[50] >= n[100] && n[100] >= n[500]).toBe(true);
    expect(R.raiseToFloor({ ...base, prices: { 10: 40000, 50: 38000, 100: 36000, 500: 34000 } as any })).toBeNull();
  });
  it('competitorCut giảm 2% nhưng không xuống dưới sàn', () => {
    const p = { ...base, prices: { 10: 40000, 50: 38000, 100: 36000, 500: 34000 } as any };
    expect(R.competitorCut(p, 35000, 10)![10]).toBe(39000);
    expect(R.competitorCut(p, 41000, 10)).toBeNull();
    const floor = R.priceForMargin(17000, 0);
    expect(R.competitorCut({ ...base, prices: { 10: floor, 50: floor, 100: floor, 500: floor } as any }, 1000, 10)).toBeNull();
  });
  it('xưởng: chỉ đổi khi xưởng chính không đạt và có dự phòng đạt', () => {
    const a = { id: 'a', name: 'A', trust_score: 70, defect_rate: 0.04 };
    const b = { id: 'b', name: 'B', trust_score: 90, defect_rate: 0.01 };
    const c = { id: 'c', name: 'C', trust_score: 95, defect_rate: 0.03 };
    expect(R.pickBackup(a, [c, b])?.id).toBe('b');
    expect(R.pickBackup(b, [a])).toBeNull();
    expect(R.pickBackup(a, [c])).toBeNull();
  });
  it('bán thử, vốn, giá vốn tăng', () => {
    expect(R.latrDecision(4.2)).toBe('SCALE');
    expect(R.latrDecision(1.5)).toBe('STOP');
    expect(R.latrDecision(2.5)).toBeNull();
    expect(R.latrDecision(null)).toBeNull();
    expect(R.capitalDecision(19)).toBe('LOCK');
    expect(R.capitalDecision(22)).toBe('WARN');
    expect(R.capitalDecision(30)).toBe('SAFE');
    expect(R.costJumped(100, 110)).toBe(true);
    expect(R.costJumped(100, 109)).toBe(false);
  });
  it('khớp yêu cầu báo giá theo SKU hoặc tên không dấu', () => {
    const ps = [{ sku: 'AO-3D', name: 'Áo thun in 3D form rộng' }, { sku: 'THAU-304', name: 'Thau rửa bát inox 304' }];
    expect(R.matchProduct('cần 200 cái thau rua bat inox', ps)?.sku).toBe('THAU-304');
    expect(R.matchProduct('báo giá AO-3D size L', ps)?.sku).toBe('AO-3D');
    expect(R.matchProduct('máy xay sinh tố', ps)).toBeNull();
  });
  it('đủ 4 kịch bản đàm phán tiếng Trung kèm tiếng Việt', () => {
    const s = R.negotiationScripts({ productVi: 'Thau', priceCny: 5, targetCny: 4.5, moq: 500, testQty: 50 });
    expect(s.map((x) => x.ten)).toEqual(['Giá', 'MOQ', 'Chất lượng', 'Thanh toán']);
    expect(s[0].zh).toContain('4.5');
  });
});

describe('AI tìm xưởng (so khớp ngành, giá, số lượng)', async () => {
  const { rankCandidates, recommend, inquiryMessage } = await import('@/lib/sourcing');
  const { phoneKey } = await import('@/lib/countries');
  const sup = (id: string, trust: number, defect: number, cats = ['Gia dụng'], intl = false) => ({ id, name: id, categories: cats, trust_score: trust, defect_rate: defect, ships_international: intl });
  const off = (id: string, cost: number, moq: number, cat = 'Gia dụng', text = 'Thau inox') => ({ id, product_text: text, category: cat, unit_cost: cost, moq, verified: true });
  const cands = [
    { supplier: sup('re-nhung-kem', 60, 0.05), offer: off('o1', 9000, 100) },
    { supplier: sup('tot-moq-cao', 92, 0.01), offer: off('o2', 10000, 1000) },
    { supplier: sup('tot-moq-thap', 90, 0.01), offer: off('o3', 11000, 50) },
    { supplier: sup('khac-nganh', 99, 0.0, ['Điện tử']), offer: off('o4', 5000, 10, 'Điện tử') },
    { supplier: sup('chua-bao-gia', 95, 0.01), offer: null },
  ];
  it('chỉ xét đúng ngành; xưởng không đạt Trust/lỗi không được đề xuất', () => {
    const r = rankCandidates({ category: 'Gia dụng', text: 'Thau inox', quantity: 200, targetUnitPrice: 20000 }, cands);
    expect(r.map((x) => x.supplier.id)).not.toContain('khac-nganh');
    expect(r.find((x) => x.supplier.id === 're-nhung-kem')!.eligible).toBe(false);
    expect(r.find((x) => x.supplier.id === 'chua-bao-gia')!.reasons.join()).toMatch(/hỏi giá/);
  });
  it('ưu tiên xưởng đủ MOQ cho số lượng cần; MOQ cao thì đề xuất bán thử', () => {
    const need = { category: 'Gia dụng', text: 'Thau inox', quantity: 200, targetUnitPrice: 20000 };
    const rec = recommend(need, rankCandidates(need, cands))!;
    expect(rec.primary.supplier.id).toBe('tot-moq-thap');
    expect(rec.backups.map((b) => b.supplier.id)).toContain('tot-moq-cao');
    const big = { ...need, quantity: 2000 };
    expect(recommend(big, rankCandidates(big, cands))!.primary.supplier.id).toBe('tot-moq-cao');
  });
  it('giá báo khách: giữ giá khách muốn nếu đạt biên 15%, không thì lấy biên mục tiêu 30%', () => {
    const need = { category: 'Gia dụng', text: 'Thau inox', quantity: 200, targetUnitPrice: 20000 };
    expect(recommend(need, rankCandidates(need, cands))!.unitPrice).toBe(20000);
    const low = { ...need, targetUnitPrice: 11500 };
    const r = recommend(low, rankCandidates(low, cands));
    expect(r === null || r.margin >= 15).toBe(true);
    const none = { ...need, targetUnitPrice: null };
    expect(recommend(none, rankCandidates(none, cands))!.margin).toBeGreaterThanOrEqual(30);
  });
  it('không có ngành: so theo mô tả báo giá', () => {
    const r = rankCandidates({ category: null, text: 'thau inox 30cm', quantity: 100 }, cands);
    expect(r.every((x) => x.offer)).toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });
  it('tin hỏi giá có số lượng và yêu cầu QC / thanh toán', () => {
    const m = inquiryMessage({ productVi: 'Thau inox', quantity: 300, country: 'US' });
    expect(m.zh).toContain('300');
    expect(m.vi).toMatch(/giao quốc tế/);
  });
  it('số điện thoại: Việt Nam về 0xxx, nước ngoài giữ +mã nước', () => {
    expect(phoneKey('+84 912 345 678')).toBe('0912345678');
    expect(phoneKey('0912.345.678')).toBe('0912345678');
    expect(phoneKey('+1 (415) 555-0100')).toBe('+14155550100');
    expect(phoneKey('0033 6 12 34 56 78')).toBe('+33612345678');
    expect(phoneKey('12345')).toBeNull();
  });
});

describe('AI phân loại khiếu nại', async () => {
  const { classifyIssue } = await import('@/lib/complaints');
  it('hàng lỗi: đổi hàng, mức vừa', () => {
    const c = classifyIssue({ kind: 'KHIEU_NAI', message: 'Hàng bị hỏng 5 cái, không dùng được' });
    expect(c.resolution).toBe('DOI_HANG');
    expect(c.severity).toBe('VUA');
    expect(c.status).toBe('MOI');
  });
  it('"không" không bị hiểu là "hỏng"; "trên" không bị hiểu là "trễ"', () => {
    const c = classifyIssue({ kind: 'KHIEU_NAI', message: 'Tôi không thấy mã vận đơn trên trang' });
    expect(c.resolution).toBe('XIN_LOI');
    expect(c.reason).not.toMatch(/hàng lỗi|giao chậm/);
  });
  it('hoàn tiền đơn trên 10 triệu: mức cao, chuyển thẳng Chờ CEO', () => {
    const c = classifyIssue({ kind: 'KHIEU_NAI', message: 'Yêu cầu hoàn tiền ngay', orderAmount: 15_000_000 });
    expect(c.resolution).toBe('HOAN_TIEN');
    expect(c.severity).toBe('CAO');
    expect(c.status).toBe('CHO_CEO');
    expect(classifyIssue({ kind: 'KHIEU_NAI', message: 'Yêu cầu hoàn tiền', orderAmount: 2_000_000 }).status).toBe('MOI');
  });
  it('nguy cơ khủng hoảng hoặc mất tiền: mức cao', () => {
    expect(classifyIssue({ kind: 'KHIEU_NAI', message: 'Shop lừa đảo, tôi sẽ báo công an' }).severity).toBe('CAO');
    expect(classifyIssue({ kind: 'LOI', message: 'Bị trừ tiền 2 lần khi chuyển khoản' }).severity).toBe('CAO');
    expect(classifyIssue({ kind: 'LOI', message: 'Nút thanh toán không bấm được' }).severity).toBe('VUA');
    expect(classifyIssue({ kind: 'LOI', message: 'Ảnh sản phẩm bị mờ' }).severity).toBe('THAP');
  });
});

describe('slogan theo trang', async () => {
  const { sloganFor, SLOGANS } = await import('@/lib/slogans');
  it('mỗi trang một câu', () => {
    expect(sloganFor('/')).toBe(SLOGANS.gia);
    expect(sloganFor('/san-pham/abc')).toBe(SLOGANS.chietkhau);
    expect(sloganFor('/bao-gia')).toBe(SLOGANS.chietkhau);
    expect(sloganFor('/gio-hang')).toBe(SLOGANS.thuong);
    expect(sloganFor('/don-hang')).toBe(SLOGANS.vui);
    expect(sloganFor('/truy-xuat/AO-3D')).toBe(SLOGANS.vui);
  });
});

describe('marketing, logistics, CSKH', async () => {
  const M = await import('@/lib/marketing');
  const L = await import('@/lib/logistics');
  const C = await import('@/lib/cskh');
  const t = (o: Partial<{ days: number; spend: number; impressions: number; clicks: number; orders: number; revenue: number }>) =>
    ({ days: 5, spend: 1e6, impressions: 50000, clicks: 1500, orders: 10, revenue: 3e6, ...o });
  it('quảng cáo: ROAS < 2 hoặc CTR < 2% dừng; CTR > 3% và ROAS đạt thì tăng; ít số liệu thì giữ', () => {
    expect(M.adDecision(t({ revenue: 1.5e6 })).action).toBe('STOP');
    expect(M.adDecision(t({ clicks: 500 })).action).toBe('STOP');
    expect(M.adDecision(t({ clicks: 2000 }), 2.5).action).toBe('SCALE');
    expect(M.adDecision(t({ clicks: 1250 })).action).toBeNull();
    expect(M.adDecision(t({ days: 2, revenue: 0 })).action).toBeNull();
    expect(M.adMetrics(t({})).roas).toBe(3);
  });
  it('CSV số liệu quảng cáo', () => {
    const r = M.parseAdCsv('ngay,chi_phi,hien_thi,click,don,doanh_thu\n05/11/2026,1.000.000,40000,1400,4,1500000\n2026-11-04,x,1,1,1,1');
    expect(r.rows).toEqual([{ day: '2026-11-05', spend: 1e6, impressions: 40000, clicks: 1400, orders: 4, revenue: 1.5e6 }]);
    expect(r.errors.length).toBe(1);
  });
  it('vận chuyển: tính phí theo bước khối lượng, chọn hãng rẻ nhất, đoán vùng', () => {
    const rates = [
      { carrier: 'GHN', zone: 'LIEN_MIEN', base_fee: 33000, base_grams: 500, step_fee: 5500, step_grams: 500, days: 3 },
      { carrier: 'GHTK', zone: 'LIEN_MIEN', base_fee: 30000, base_grams: 500, step_fee: 5000, step_grams: 500, days: 4 },
      { carrier: 'J&T', zone: 'NOI_TINH', base_fee: 15000, base_grams: 500, step_fee: 5000, step_grams: 500, days: 1 },
    ];
    expect(L.rateFee(rates[1], 1200)).toBe(30000 + 2 * 5000);
    expect(L.cheapest(rates, 'LIEN_MIEN', 2000)[0].carrier).toBe('GHTK');
    expect(L.guessZone('12 Lê Lợi, Quận 1, TP.HCM')).toBe('NOI_TINH');
    expect(L.guessZone('Thủ Dầu Một, Bình Dương')).toBe('NOI_MIEN');
    expect(L.guessZone('Cầu Giấy, Hà Nội')).toBe('LIEN_MIEN');
    expect(L.guessZone('Tokyo', 'JP')).toBe('QUOC_TE');
  });
  it('CSKH AI phân loại câu hỏi', () => {
    expect(C.detectIntent('Áo thun 3D giá sỉ bao nhiêu?')).toBe('GIA');
    expect(C.detectIntent('đơn TM1002 của tôi tới đâu rồi')).toBe('DON_HANG');
    expect(C.detectIntent('hàng bị hỏng, muốn hoàn tiền')).toBe('KHIEU_NAI');
    expect(C.detectIntent('xuất hóa đơn VAT được không')).toBe('HOA_DON');
    expect(C.detectIntent('chuyển khoản vào đâu')).toBe('THANH_TOAN');
    expect(C.detectIntent('giao hàng mấy ngày')).toBe('VAN_CHUYEN');
    expect(C.detectIntent('cho gặp nhân viên')).toBe('NGUOI_THAT');
    expect(C.detectIntent('xin chào')).toBe('CHAO');
  });
});

describe('CSKH so khớp sản phẩm khi chat', async () => {
  const { chatMatch } = await import('@/lib/cskh');
  const ps = [{ name: 'Áo thun in 3D form rộng' }, { name: 'Thau rửa bát inox 304' }, { name: 'Bình giữ nhiệt 500 ml' }];
  it('hiểu cách viết tắt, không đoán bừa', () => {
    expect(chatMatch('gia si ao thun 3D bao nhieu', ps)?.name).toBe('Áo thun in 3D form rộng');
    expect(chatMatch('bình giữ nhiệt 500ml giá sao', ps)?.name).toBe('Bình giữ nhiệt 500 ml');
    expect(chatMatch('giá sỉ bao nhiêu', ps)).toBeNull();
    expect(chatMatch('máy xay sinh tố', ps)).toBeNull();
  });
});
