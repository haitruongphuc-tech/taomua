import { notFound, redirect } from 'next/navigation';
import { one } from '@/lib/db';
import { isUuid } from '@/lib/catalog';

// Đường dẫn QR theo spec (/qr/[id]): nhận mã sản phẩm hoặc SKU, chuyển tới trang truy xuất 7 ngôn ngữ.
export default async function QrRedirect({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id).slice(0, 60);
  const p = isUuid(id) ? await one('SELECT sku FROM products WHERE id=$1 AND published', [id]) : await one('SELECT sku FROM products WHERE upper(sku)=upper($1) AND published', [id]);
  if (!p) notFound();
  redirect(`/truy-xuat/${encodeURIComponent(p.sku)}`);
}
