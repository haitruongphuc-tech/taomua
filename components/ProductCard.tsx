import Link from 'next/link';
import type { PublicProduct } from '@/lib/catalog';

export function Trust({ score, verified }: { score: number | null; verified?: boolean | null }) {
  if (score === null) return null;
  return (
    <span className="trust" title="TrustScore của xưởng, 0-100">
      <b className={score >= 80 ? '' : 'mid'}>{score}</b> TrustScore{verified ? ' · đã xác minh' : ''}
    </span>
  );
}

export default function ProductCard({ p }: { p: PublicProduct }) {
  return (
    <Link href={`/san-pham/${p.id}`} className="card pcard" style={{ color: 'inherit', textDecoration: 'none' }}>
      <div className="emoji" aria-hidden>{p.image_emoji}</div>
      <div className="row spread">
        <span className="badge">{p.category}</span>
        {p.trend_score >= 80 && <span className="badge orange">Đang hot</span>}
      </div>
      <h3>{p.name}</h3>
      <div className="muted small">{p.supplier_name} · {p.supplier_country} · {p.supplier_years} năm</div>
      <Trust score={p.trust_score} verified={p.verified_cert} />
      <div className="tiers">
        {([10, 50, 100, 500] as const).map((t) => (
          <div key={t}>{t}c<b>{Math.round(p[`price_taomua_${t}`] / 1000)}k</b></div>
        ))}
      </div>
      <div className="muted small">Tối thiểu {Math.max(10, p.moq)} cái{p.is_simulated ? ' · dữ liệu giả lập' : ''}</div>
    </Link>
  );
}
