'use client';
import { useEffect, useState } from 'react';
import { analyzeProduct } from '@/lib/pricing';

// Xem trước biên khi đang nhập giá. Cảnh báo không chặn lưu.
export default function MarginPreview({ formId }: { formId: string }) {
  const [v, setV] = useState<Record<string, number>>({});
  useEffect(() => {
    const f = document.getElementById(formId) as HTMLFormElement | null;
    if (!f) return;
    const read = () => {
      const fd = new FormData(f);
      const o: Record<string, number> = {};
      for (const k of ['cost', 'fee', 'input_vat', 'price_taomua_10', 'price_taomua_50', 'price_taomua_100', 'price_taomua_500']) o[k] = Number(fd.get(k)) || 0;
      setV(o);
    };
    read();
    f.addEventListener('input', read);
    return () => f.removeEventListener('input', read);
  }, [formId]);
  let a: ReturnType<typeof analyzeProduct> | null = null;
  try { a = analyzeProduct(v as any); } catch { a = null; }
  if (!a) return <div className="alert info small">Nhập chi phí và 4 bậc giá để xem biên.</div>;
  return (
    <div className="stack">
      <div className="table-wrap"><table>
        <thead><tr><th>Bậc</th><th className="num">Giá</th><th className="num">VAT ra</th><th className="num">LN ròng/cái</th><th className="num">Biên/CP</th><th className="num">Biên/DT</th></tr></thead>
        <tbody>{a.rows.map((r) => (
          <tr key={r.tier}><td>{r.tier}</td><td className="num">{r.price.toLocaleString('vi-VN')}</td><td className="num">{r.vatOut.toLocaleString('vi-VN')}</td>
            <td className="num">{r.net.toLocaleString('vi-VN')}</td>
            <td className="num"><span className={`badge ${r.net <= 0 ? 'bad' : r.marginOnCost > 150 ? 'warn' : r.marginOnCost < 15 ? 'warn' : 'ok'}`}>{r.marginOnCost}%</span></td>
            <td className="num">{r.marginOnRevenue}%</td></tr>
        ))}</tbody>
      </table></div>
      {a.warnings.map((w, i) => <div key={i} className="alert warn small">{w}</div>)}
      <p className="muted small">Biên dưới 15% hoặc lỗ: đơn sẽ không được tự duyệt. Biên trên 150%: chỉ cảnh báo, vẫn lưu được.</p>
    </div>
  );
}
