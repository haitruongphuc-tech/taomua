// Pháp nhân bán hàng — theo giấy chứng nhận chủ dự án cung cấp.
export const LEGAL = {
  name: 'CÔNG TY CỔ PHẦN NỮ HOÀNG NỘI THẤT',
  taxCode: '0316437942',
};

/** Thông tin nhận tiền lấy từ biến môi trường; chưa cấu hình thì không hiển thị số tài khoản nào. */
export function paymentInfo() {
  const { PAYMENT_BANK_NAME: bank, PAYMENT_ACCOUNT_NO: no, PAYMENT_ACCOUNT_NAME: name } = process.env;
  return bank && no && name ? { bank, no, name, swift: process.env.PAYMENT_SWIFT || null } : null;
}
