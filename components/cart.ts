'use client';
// Giỏ hàng lưu trong trình duyệt. Giá luôn được tính lại ở máy chủ khi xem giỏ và khi đặt hàng.
export type CartLine = { id: string; qty: number };
const KEY = 'taomua_cart_v1';

export function readCart(): CartLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x?.id === 'string' && Number.isFinite(x?.qty)) : [];
  } catch {
    return [];
  }
}
export function writeCart(lines: CartLine[]) {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* bộ nhớ bị chặn */ }
  window.dispatchEvent(new Event('cart-changed'));
}
export function addToCart(id: string, qty: number) {
  const lines = readCart();
  const ex = lines.find((l) => l.id === id);
  if (ex) ex.qty += qty; else lines.push({ id, qty });
  writeCart(lines);
}
