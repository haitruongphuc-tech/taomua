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
