import type { PoolClient } from 'pg';
import { TIERS } from '../pricing';
import { UserError } from '../action';

export type ActionRow = { id: string; kind: string; detail: any };

/** Thực hiện một đề xuất đã được duyệt (hoặc AI tự làm). Kiểm tra dữ liệu chưa bị đổi từ lúc đề xuất. */
export async function applyAction(c: PoolClient, a: ActionRow): Promise<string> {
  const d = a.detail ?? {};
  switch (a.kind) {
    case 'PRICE_CHANGE': {
      const p = (await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [d.product_id])).rows[0];
      if (!p) throw new UserError('Sản phẩm không còn.');
      for (const t of TIERS) {
        if (Number(p[`price_taomua_${t}`]) !== Number(d.from[t])) throw new UserError('Giá đã được đổi sau khi AI đề xuất. Đề xuất này không còn đúng.');
      }
      await c.query(`UPDATE products SET price_taomua_10=$2, price_taomua_50=$3, price_taomua_100=$4, price_taomua_500=$5, updated_at=now() WHERE id=$1`,
        [d.product_id, d.to[10], d.to[50], d.to[100], d.to[500]]);
      return 'Đã đổi giá.';
    }
    case 'SWITCH_SUPPLIER': {
      const r = await c.query(
        `UPDATE products SET supplier_id=$3, supplier_ids_backup=array_append(array_remove(supplier_ids_backup, $3::uuid), $2::uuid), updated_at=now()
         WHERE id=$1 AND supplier_id=$2`, [d.product_id, d.from_id, d.to_id]);
      if (!r.rowCount) throw new UserError('Xưởng chính đã được đổi sau khi AI đề xuất.');
      return 'Đã đổi xưởng chính.';
    }
    case 'PRODUCT_STATUS': {
      const r = await c.query('UPDATE products SET status=$3, updated_at=now() WHERE id=$1 AND status=$2', [d.product_id, d.from, d.to]);
      if (!r.rowCount) throw new UserError('Trạng thái sản phẩm đã đổi sau khi AI đề xuất.');
      return 'Đã đổi trạng thái sản phẩm.';
    }
    case 'CONTROL_SET': {
      await c.query(`INSERT INTO payment_controls(key, enabled, updated_at) VALUES ($1,$2,now())
        ON CONFLICT (key) DO UPDATE SET enabled=EXCLUDED.enabled, updated_by=NULL, updated_at=now()`, [d.key, !!d.enabled]);
      return 'Đã đổi nút kiểm soát chi.';
    }
    case 'RFQ_QUOTE': {
      const r = await c.query(`UPDATE rfqs SET quote_price=$2, quote_note=$3, status='DA_BAO_GIA' WHERE id=$1 AND status IN ('MOI','DANG_TIM_XUONG')`,
        [d.rfq_id, d.total, String(d.note ?? '').slice(0, 1000)]);
      if (!r.rowCount) throw new UserError('Yêu cầu báo giá đã được xử lý.');
      return 'Đã báo giá.';
    }
    case 'SUPPLIER_TRUST':
      await c.query('UPDATE suppliers SET trust_score=$2 WHERE id=$1', [d.supplier_id, d.to]);
      return 'Đã cập nhật TrustScore.';
    case 'TRANSLATE':
      await c.query(`UPDATE products SET name_i18n=$2, updated_at=now() WHERE id=$1`, [d.product_id, JSON.stringify(d.names)]);
      return 'Đã lưu tên 7 ngôn ngữ.';
    case 'NOTE':
      return 'Đã ghi nhận.';
    default:
      throw new UserError(`Loại đề xuất không hỗ trợ: ${a.kind}`);
  }
}
