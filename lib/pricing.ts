// Công thức biên ròng sau thuế, phí — theo xác nhận của chủ dự án:
// giá bán đã gồm VAT 8% nên VAT đầu ra = giá × 8/108, và VAT đầu vào được khấu trừ.
export const VAT_RATE = 0.08;
export const BANK_FEE_RATE = 0.01;
export const CIT_RATE = 0.2;
export const WHOLESALE_MARGIN_WARN = 150; // % trên chi phí: trên mức này thường là nhập nhầm giá
export const MARGIN_FLOOR = 15;           // % trên chi phí: dưới mức này không được tự duyệt

export type Breakdown = {
  revenue: number;        // tổng doanh thu (đã gồm VAT)
  cost: number;           // tổng chi phí trước thuế (chưa trừ VAT đầu vào)
  inputVat: number;       // VAT đầu vào được khấu trừ
  channelFee: number;     // phí kênh bán (sàn), tính vào chi phí
  costNet: number;        // chi phí thực = cost + channelFee − inputVat
  vatOut: number;         // VAT đầu ra
  vatPayable: number;     // VAT phải nộp = đầu ra − đầu vào (có thể âm: được khấu trừ tiếp)
  bankFee: number;
  preTax: number;         // LN trước TNDN
  cit: number;            // TNDN 20%, chỉ khi có lãi
  net: number;            // LN ròng sau thuế
  marginOnCost: number;   // % LN ròng / chi phí thực
  marginOnRevenue: number;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

export function calcMargin(input: { revenue: number; cost: number; inputVat?: number; channelFeePct?: number }): Breakdown {
  const revenue = input.revenue;
  const cost = input.cost;
  const inputVat = input.inputVat ?? 0;
  if (!(revenue > 0)) throw new Error('Doanh thu phải lớn hơn 0');
  if (!(cost > 0)) throw new Error('Chi phí phải lớn hơn 0');
  if (inputVat < 0 || inputVat >= cost) throw new Error('VAT đầu vào phải từ 0 và nhỏ hơn chi phí');
  const channelFee = revenue * ((input.channelFeePct ?? 0) / 100);
  const costNet = cost + channelFee - inputVat;
  const vatOut = (revenue * VAT_RATE) / (1 + VAT_RATE);
  const bankFee = revenue * BANK_FEE_RATE;
  const preTax = revenue - costNet - vatOut - bankFee;
  const cit = preTax > 0 ? preTax * CIT_RATE : 0;
  const net = preTax - cit;
  return {
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    inputVat: Math.round(inputVat),
    channelFee: Math.round(channelFee),
    costNet: Math.round(costNet),
    vatOut: Math.round(vatOut),
    vatPayable: Math.round(vatOut - inputVat),
    bankFee: Math.round(bankFee),
    preTax: Math.round(preTax),
    cit: Math.round(cit),
    net: Math.round(net),
    marginOnCost: r2((net / costNet) * 100),
    marginOnRevenue: r2((net / revenue) * 100),
  };
}

export const TIERS = [10, 50, 100, 500] as const;
export type Tier = (typeof TIERS)[number];

export type TierPrices = { price_taomua_10: number; price_taomua_50: number; price_taomua_100: number; price_taomua_500: number };

export function tierFor(qty: number): Tier | null {
  if (qty >= 500) return 500;
  if (qty >= 100) return 100;
  if (qty >= 50) return 50;
  if (qty >= 10) return 10;
  return null;
}

export function priceForTier(p: TierPrices, tier: Tier): number {
  return Number(p[`price_taomua_${tier}` as keyof TierPrices]);
}

/** Phân tích biên của từng bậc giá cho một sản phẩm, và cảnh báo nếu biên sỉ vượt 150%. */
export function analyzeProduct(p: TierPrices & { cost: number; fee: number; input_vat: number }) {
  const unitCost = Number(p.cost) + Number(p.fee);
  const rows = TIERS.map((t) => ({ tier: t, price: priceForTier(p, t), ...calcMargin({ revenue: priceForTier(p, t), cost: unitCost, inputVat: Number(p.input_vat) }) }));
  const warnings: string[] = [];
  for (const r of rows) {
    if (r.marginOnCost > WHOLESALE_MARGIN_WARN) warnings.push(`Bậc ${r.tier}: biên ${r.marginOnCost}% trên chi phí, vượt ${WHOLESALE_MARGIN_WARN}%. Hãy kiểm tra lại giá.`);
    if (r.net <= 0) warnings.push(`Bậc ${r.tier}: bán lỗ (${r.net.toLocaleString('vi-VN')} đ mỗi cái).`);
  }
  const prices = rows.map((r) => r.price);
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) warnings.push(`Giá bậc ${TIERS[i]} cao hơn bậc ${TIERS[i - 1]}.`);
  }
  return { unitCost, rows, warnings };
}
