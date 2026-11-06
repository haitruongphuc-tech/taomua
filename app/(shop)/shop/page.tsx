import Link from 'next/link';
import { listRetail } from '@/lib/retail';
import RetailFeed from './RetailFeed';
import { siteContent } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = { title: '9mua · Mua lẻ' };

export default async function RetailShop() {
  const [items, site] = await Promise.all([listRetail(), siteContent()]);
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>{site.shop_title} <span className="muted small">từ 1 cái, giao tận nhà</span></h1>
        <Link className="small" href="/">Mua sỉ từ 10 cái rẻ hơn ở taomua.com →</Link>
      </div>
      <p className="muted small">Hàng hot lướt như TikTok. Bấm <b>Mua ngay</b> là đặt 1 chạm; lần sau trình duyệt nhớ thông tin giao hàng.
        Tiền được taomua giữ đến khi bạn xác nhận đã nhận hàng.</p>
      {items.length === 0 ? <div className="card">Chưa có sản phẩm bán lẻ. Quản trị → Kênh bán → kênh 9mua, đặt trạng thái “Đang bán”.</div> : <RetailFeed items={items} />}
    </div>
  );
}
