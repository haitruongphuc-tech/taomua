'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readCart } from './cart';

export default function CartBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const update = () => setN(readCart().length);
    update();
    window.addEventListener('cart-changed', update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('cart-changed', update); window.removeEventListener('storage', update); };
  }, []);
  return <Link href="/gio-hang" className="cart-pill">Giỏ hàng · {n}</Link>;
}
