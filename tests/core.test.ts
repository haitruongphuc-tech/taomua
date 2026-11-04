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
