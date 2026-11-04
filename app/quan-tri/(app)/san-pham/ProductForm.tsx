import MarginPreview from '@/components/MarginPreview';

const STATUSES = ['TREND_HUNTER', 'SUPPLIER_BRAIN', 'PRICING', 'PENDING_APPROVAL', 'APPROVED', 'LATR_TEST', 'MASS_IMPORT', 'DROPSHIP_SI', 'PAUSED'];

export default function ProductForm({ p, suppliers, action }: { p?: any; suppliers: { id: string; name: string; trust_score: number }[]; action: (fd: FormData) => Promise<void> }) {
  const n = (k: string) => (p ? p[k] ?? '' : '');
  return (
    <form id="pform" action={action} className="grid cols-2" style={{ alignItems: 'start' }}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <section className="card stack">
        <h2>Thông tin</h2>
        <div className="form-grid">
          <label className="field">Mã SKU<input name="sku" required defaultValue={n('sku')} /></label>
          <label className="field">Biểu tượng<input name="image_emoji" defaultValue={n('image_emoji') || '📦'} maxLength={4} /></label>
        </div>
        <label className="field">Tên sản phẩm<input name="name" required defaultValue={n('name')} /></label>
        <div className="form-grid">
          <label className="field">Danh mục<input name="category" required defaultValue={n('category')} /></label>
          <label className="field">Điểm xu hướng (0-100)<input name="trend_score" type="number" min={0} max={100} defaultValue={n('trend_score') || 50} /></label>
        </div>
        <label className="field">Mô tả<textarea name="description" defaultValue={n('description')} /></label>
        <label className="field">Xưởng chính
          <select name="supplier_id" defaultValue={n('supplier_id')}>
            <option value="">— Chưa chọn —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} (TrustScore {s.trust_score})</option>)}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">MOQ (tối thiểu)<input name="moq" type="number" min={1} defaultValue={n('moq') || 10} /></label>
          <label className="field">Giai đoạn<select name="status" defaultValue={n('status') || 'PRICING'}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="field">Ghi chú kho<input name="stock_note" defaultValue={n('stock_note') || 'Giao thẳng từ xưởng'} /></label>
        </div>
        <div className="form-grid">
          <label className="field">LATR: số cái bán thử<input name="latr_test_qty" type="number" min={0} defaultValue={n('latr_test_qty')} /></label>
          <label className="field">LATR: CTR (%)<input name="latr_ctr" type="number" step="0.1" min={0} defaultValue={n('latr_ctr')} /></label>
        </div>
        <label className="row"><input type="checkbox" name="published" defaultChecked={p ? p.published : false} /> Hiện trên taomua.com</label>
        <label className="row"><input type="checkbox" name="is_simulated" defaultChecked={p ? p.is_simulated : false} /> Dữ liệu giả lập</label>
      </section>
      <section className="card stack">
        <h2>Chi phí và giá (đồng / cái)</h2>
        <div className="form-grid">
          <label className="field">Giá vốn<input name="cost" type="number" min={0} required defaultValue={n('cost')} /></label>
          <label className="field">Phí (ship, ads, logistics…)<input name="fee" type="number" min={0} defaultValue={n('fee') || 0} /></label>
          <label className="field">VAT đầu vào được trừ<input name="input_vat" type="number" min={0} defaultValue={n('input_vat') || 0} /></label>
        </div>
        <div className="form-grid">
          {[10, 50, 100, 500].map((t) => (
            <label key={t} className="field">Giá bậc {t} (gồm VAT)<input name={`price_taomua_${t}`} type="number" min={1} required defaultValue={n(`price_taomua_${t}`)} /></label>
          ))}
        </div>
        <MarginPreview formId="pform" />
        <button className="btn">Lưu sản phẩm</button>
      </section>
    </form>
  );
}
