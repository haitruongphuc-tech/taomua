import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { LANGS, LANG_LABEL, type Lang } from '@/lib/ai';
import { traceBySku, t, countryIn, isLang } from '@/lib/trace';
import TraceQr from '@/components/TraceQr';

export const dynamic = 'force-dynamic';

/** Ngôn ngữ: ?lang=..., nếu không có thì theo trình duyệt của người quét QR (quét ở VN ra tiếng Việt, ở CN ra tiếng Trung...). */
function pickLang(param?: string): Lang {
  if (isLang(param)) return param;
  const accept = headers().get('accept-language') ?? '';
  for (const part of accept.split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return 'vi';
}

export async function generateMetadata({ params }: { params: { sku: string } }) {
  const p = await traceBySku(decodeURIComponent(params.sku));
  return { title: p ? `${p.sku} · truy xuất` : 'Truy xuất' };
}

export default async function TracePage({ params, searchParams }: { params: { sku: string }; searchParams: { lang?: string } }) {
  const p = await traceBySku(decodeURIComponent(params.sku));
  if (!p) notFound();
  const l = pickLang(searchParams.lang);
  const name = (p.name_i18n?.[l] as string | undefined) ?? p.name;
  const pct = (x: number | null) => (x == null ? t('not_checked', l) : `${(Number(x)).toLocaleString(l === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 })}%`);
  const money = (x: number) => `${Number(x).toLocaleString('vi-VN')} ₫`;
  return (
    <div className="stack" style={{ maxWidth: 720 }} lang={l}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {LANGS.map((x) => <Link key={x} href={`?lang=${x}`} className={`badge ${x === l ? 'orange' : ''}`}>{LANG_LABEL[x]}</Link>)}
      </div>
      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="small muted">{t('title', l)}</div>
            <h1 style={{ margin: '4px 0' }}>{p.image_emoji} {name}</h1>
            {name !== p.name && <div className="small muted">{p.name}</div>}
            <div className="small">{t('code', l)}: <b className="mono">{p.sku}</b> · {t('category', l)}: {p.category}</div>
          </div>
          <TraceQr sku={p.sku} size={120} label={false} />
        </div>
        {p.is_simulated && <div className="alert warn small">{t('simulated', l)}</div>}
        <table className="small"><tbody>
          <tr><td>{t('factory', l)}</td><td><b>{p.supplier_name ?? '—'}</b> ({p.source ?? '—'})</td></tr>
          <tr><td>{t('origin', l)} · {t('country', l)}</td><td>{countryIn(p.country, l)}</td></tr>
          <tr><td>{t('trust', l)}</td><td><b>{p.trust_score ?? '—'}</b>/100</td></tr>
          <tr><td>{t('qc', l)}</td><td>{pct(p.rynn_brain_pass)}</td></tr>
          <tr><td>{t('defect', l)}</td><td>{p.defect_rate == null ? '—' : pct(Number(p.defect_rate) * 100)}</td></tr>
          <tr><td>{t('ontime', l)}</td><td>{p.on_time_rate == null ? '—' : pct(Number(p.on_time_rate) * 100)}</td></tr>
          <tr><td>{t('verified', l)}</td><td>{p.verified_cert ? t('yes', l) : t('no', l)}</td></tr>
          <tr><td>{t('source_update', l)}</td><td>{p.source_updated ? new Date(p.source_updated).toISOString().slice(0, 10) : '—'}</td></tr>
        </tbody></table>
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>{t('prices', l)}</h2>
        <table className="small"><thead><tr><th>{t('qty', l)}</th><th className="num">{t('unit', l)}</th></tr></thead><tbody>
          {[10, 50, 100, 500].map((q) => <tr key={q}><td>{Math.max(q, q === 10 ? p.moq : q)}+</td><td className="num">{money(p[`price_taomua_${q}`])}</td></tr>)}
        </tbody></table>
        <p className="small muted">{t('escrow', l)}</p>
        <Link className="btn" href={`/san-pham/${p.id}`}>{t('buy', l)}</Link>
      </section>
    </div>
  );
}
