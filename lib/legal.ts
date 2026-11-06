// Pháp nhân bán hàng (chủ dự án chốt 06/11/2026): TAOMUA Co., LTD — đại diện pháp luật Lê Thị Huỳnh Như.
// MST và địa chỉ đăng ký đã có nhưng chưa gửi vào hệ thống: nhập vào .env (LEGAL_TAX_CODE, LEGAL_ADDRESS); thiếu thì hiện "đang cập nhật".
export const LEGAL = {
  name: process.env.LEGAL_NAME || 'TAOMUA Co., LTD',
  nameVi: process.env.LEGAL_NAME_VI || 'CÔNG TY TNHH TAOMUA',
  representative: process.env.LEGAL_REPRESENTATIVE || 'LÊ THỊ HUỲNH NHƯ',
  taxCode: process.env.LEGAL_TAX_CODE || 'đang cập nhật',
  address: process.env.LEGAL_ADDRESS || 'đang cập nhật',
};
export const legalComplete = () => !!(process.env.LEGAL_TAX_CODE && process.env.LEGAL_ADDRESS);

/** Thông tin nhận tiền lấy từ biến môi trường; chưa cấu hình thì không hiển thị số tài khoản nào. */
export function paymentInfo() {
  const { PAYMENT_BANK_NAME: bank, PAYMENT_ACCOUNT_NO: no, PAYMENT_ACCOUNT_NAME: name } = process.env;
  return bank && no && name ? { bank, no, name, swift: process.env.PAYMENT_SWIFT || null, bin: process.env.PAYMENT_BANK_BIN || null } : null;
}
