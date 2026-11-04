// TrustScore tạm tính 5 yếu tố (chủ dự án sẽ bổ sung danh sách 19 yếu tố và trọng số).
export const TRUST_WEIGHTS = { response: 18, cert: 20, defect: 25, onTime: 25, inventory: 12 } as const;

export type TrustInput = { response_time_sec: number; verified_cert: boolean; defect_rate: number; on_time_rate: number; inventory_sync: boolean };

export function trustScore(s: TrustInput) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  // Phản hồi ≤ 90 giây đạt đủ điểm, giảm tuyến tính đến 1 giờ.
  const response = s.response_time_sec <= 90 ? 1 : clamp(1 - (s.response_time_sec - 90) / (3600 - 90));
  const defect = clamp(1 - Number(s.defect_rate) / 0.1); // lỗi 0% = đủ điểm, 10% = 0
  const onTime = clamp(Number(s.on_time_rate));
  const parts = {
    response: response * TRUST_WEIGHTS.response,
    cert: (s.verified_cert ? 1 : 0) * TRUST_WEIGHTS.cert,
    defect: defect * TRUST_WEIGHTS.defect,
    onTime: onTime * TRUST_WEIGHTS.onTime,
    inventory: (s.inventory_sync ? 1 : 0) * TRUST_WEIGHTS.inventory,
  };
  const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { score, parts };
}
