import { redirect } from 'next/navigation';
import { requireUser, actorOf } from '@/lib/auth';
import { q } from '@/lib/db';
import { saveProduct } from '@/lib/products';
import { UserError } from '@/lib/action';
import ProductForm from '../ProductForm';
import Flash from '@/components/Flash';

async function create(fd: FormData) {
  'use server';
  const u = await requireUser('products.edit');
  let r;
  try { r = await saveProduct(fd, actorOf(u)); } catch (e) {
    if (e instanceof UserError) redirect(`/quan-tri/san-pham/moi?loi=${encodeURIComponent(e.message)}`);
    throw e;
  }
  const msg = r.warnings.length ? `Đã lưu, có cảnh báo: ${r.warnings.join(' ')}` : 'Đã thêm sản phẩm.';
  redirect(`/quan-tri/san-pham/${r.id}?${r.warnings.length ? 'loi' : 'ok'}=${encodeURIComponent(msg)}`);
}

export default async function NewProduct({ searchParams }: { searchParams: { loi?: string } }) {
  await requireUser('products.edit');
  const suppliers = await q('SELECT id, name, trust_score FROM suppliers ORDER BY name');
  return (
    <div className="stack">
      <h1>Thêm sản phẩm</h1>
      <Flash sp={searchParams} />
      <ProductForm suppliers={suppliers} action={create} />
    </div>
  );
}
