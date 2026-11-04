import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { analyzeProduct } from '@/lib/pricing';
import { vnd, pct } from '@/lib/format';
import Flash from '@/components/Flash';

export default async function Products({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  await requireUser('orders.view');
  const rows = await q(`SELECT p.*, s.name AS supplier_name, s.trust_score FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.created_at DESC`);
  return (
    <div className="stack">
      <div className="row spread"><h1 style={{ margin: 0 }}>Sản phẩm</h1><Link className="btn sm" href="/quan-tri/san-pham/moi">Thêm sản phẩm</Link></div>
      <Flash sp={searchParams} />
      <div className="table-wrap"><table>
        <thead><tr><th>Sản phẩm</th><th>Xưởng</th><th className="num">Chi phí/cái</th><th className="num">Giá 10 / 50 / 100 / 500</th><th className="num">Biên/CP theo bậc</th><th>Trạng thái</th></tr></thead>
        <tbody>{rows.map((p) => {
          const a = analyzeProduct(p);
          return (
            <tr key={p.id}>
              <td><Link href={`/quan-tri/san-pham/${p.id}`}>{p.image_emoji} {p.name}</Link><div className="small muted">{p.sku} · {p.category}{p.is_simulated ? ' · giả lập' : ''}</div></td>
              <td className="small">{p.supplier_name ?? '—'}<br />TrustScore {p.trust_score ?? '—'}</td>
              <td className="num">{vnd(a.unitCost)}</td>
              <td className="num small">{a.rows.map((r) => Math.round(r.price / 1000) + 'k').join(' / ')}</td>
              <td className="num small">{a.rows.map((r) => pct(r.marginOnCost)).join(' / ')}
                {a.warnings.length > 0 && <div><span className="badge warn" title={a.warnings.join('\n')}>{a.warnings.length} cảnh báo</span></div>}</td>
              <td>{p.published ? <span className="badge ok">Đang bán</span> : <span className="badge">Ẩn</span>}<div className="small muted">{p.status}</div></td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}
