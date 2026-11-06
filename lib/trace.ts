// RYN-TRACE truy xuất nguồn gốc (docs/MULTILINGUAL_7_AI_SPEC.md, Agent 5): mỗi sản phẩm có QR mở trang /truy-xuat/[sku],
// hiện bằng 7 ngôn ngữ VI/EN/ZH/FR/ES/JA/KO. Chỉ thông tin khách được xem: không giá vốn, không biên (quy tắc đã chốt).
import { one } from './db';
import { LANGS, type Lang } from './ai';

export const isLang = (l: string | undefined): l is Lang => !!l && (LANGS as readonly string[]).includes(l);

type Key = 'title' | 'origin' | 'factory' | 'country' | 'trust' | 'qc' | 'defect' | 'ontime' | 'verified' | 'source_update' | 'prices' | 'qty' | 'unit'
  | 'escrow' | 'simulated' | 'buy' | 'yes' | 'no' | 'not_checked' | 'category' | 'code';
const T: Record<Key, Record<Lang, string>> = {
  title: { vi: 'Truy xuất nguồn gốc', en: 'Product traceability', zh: '产品溯源', fr: 'Traçabilité du produit', es: 'Trazabilidad del producto', ja: '製品トレーサビリティ', ko: '제품 이력 추적' },
  origin: { vi: 'Nguồn gốc', en: 'Origin', zh: '来源', fr: 'Origine', es: 'Origen', ja: '原産', ko: '원산지' },
  factory: { vi: 'Xưởng sản xuất', en: 'Factory', zh: '生产工厂', fr: 'Usine', es: 'Fábrica', ja: '製造工場', ko: '제조 공장' },
  country: { vi: 'Quốc gia', en: 'Country', zh: '国家', fr: 'Pays', es: 'País', ja: '国', ko: '국가' },
  trust: { vi: 'TrustScore xưởng', en: 'Factory TrustScore', zh: '工厂信任分', fr: 'TrustScore usine', es: 'TrustScore de fábrica', ja: '工場TrustScore', ko: '공장 TrustScore' },
  qc: { vi: 'Tỉ lệ đạt QC', en: 'QC pass rate', zh: '质检合格率', fr: 'Taux de conformité QC', es: 'Tasa de aprobación QC', ja: '品質検査合格率', ko: 'QC 합격률' },
  defect: { vi: 'Tỉ lệ lỗi của xưởng', en: 'Factory defect rate', zh: '工厂不良率', fr: 'Taux de défaut', es: 'Tasa de defectos', ja: '不良率', ko: '불량률' },
  ontime: { vi: 'Giao đúng hạn', en: 'On-time delivery', zh: '准时交货率', fr: 'Livraison à temps', es: 'Entrega a tiempo', ja: '納期遵守率', ko: '정시 납품률' },
  verified: { vi: 'Chứng nhận đã xác minh', en: 'Verified certificate', zh: '已验证认证', fr: 'Certificat vérifié', es: 'Certificado verificado', ja: '認証確認済み', ko: '인증 확인됨' },
  source_update: { vi: 'Cập nhật nguồn hàng', en: 'Source last updated', zh: '货源更新', fr: 'Source mise à jour', es: 'Fuente actualizada', ja: '仕入先更新', ko: '공급처 업데이트' },
  prices: { vi: 'Giá sỉ theo số lượng (đã gồm VAT)', en: 'Wholesale price by quantity (VAT incl.)', zh: '按数量批发价（含增值税）', fr: 'Prix de gros par quantité (TVA incl.)', es: 'Precio mayorista por cantidad (IVA incl.)', ja: '数量別卸価格（税込）', ko: '수량별 도매가 (VAT 포함)' },
  qty: { vi: 'Số lượng', en: 'Quantity', zh: '数量', fr: 'Quantité', es: 'Cantidad', ja: '数量', ko: '수량' },
  unit: { vi: 'Giá mỗi cái', en: 'Unit price', zh: '单价', fr: 'Prix unitaire', es: 'Precio unitario', ja: '単価', ko: '단가' },
  escrow: { vi: 'Tiền của khách được taomua giữ đến khi khách xác nhận nhận hàng đúng; hàng lỗi được hoàn tiền.', en: 'Your payment is held by taomua until you confirm delivery; defective goods are refunded.', zh: '货款由taomua托管，确认收货后才付给工厂；次品可退款。', fr: 'Votre paiement est conservé par taomua jusqu’à confirmation de réception ; produits défectueux remboursés.', es: 'taomua retiene su pago hasta que confirme la entrega; los productos defectuosos se reembolsan.', ja: 'お支払いは受取確認までtaomuaが保管し、不良品は返金されます。', ko: '수령 확인 전까지 taomua가 결제금을 보관하며, 불량품은 환불됩니다.' },
  simulated: { vi: 'Dữ liệu thử nghiệm, chưa phải hàng thật.', en: 'Test data, not a real product yet.', zh: '测试数据，尚非真实商品。', fr: 'Données de test, pas encore un produit réel.', es: 'Datos de prueba, aún no es un producto real.', ja: 'テストデータです（実在商品ではありません）。', ko: '테스트 데이터이며 실제 상품이 아닙니다.' },
  buy: { vi: 'Đặt hàng sỉ', en: 'Order wholesale', zh: '批发下单', fr: 'Commander en gros', es: 'Pedir al por mayor', ja: '卸注文する', ko: '도매 주문' },
  yes: { vi: 'Có', en: 'Yes', zh: '是', fr: 'Oui', es: 'Sí', ja: 'はい', ko: '예' },
  no: { vi: 'Chưa', en: 'No', zh: '否', fr: 'Non', es: 'No', ja: 'いいえ', ko: '아니요' },
  not_checked: { vi: 'chưa kiểm', en: 'not checked', zh: '未检测', fr: 'non vérifié', es: 'no verificado', ja: '未検査', ko: '미검사' },
  category: { vi: 'Ngành hàng', en: 'Category', zh: '品类', fr: 'Catégorie', es: 'Categoría', ja: 'カテゴリー', ko: '카테고리' },
  code: { vi: 'Mã sản phẩm', en: 'Product code', zh: '产品编号', fr: 'Code produit', es: 'Código', ja: '商品コード', ko: '상품 코드' },
};
export const t = (k: Key, l: Lang) => T[k][l] ?? T[k].vi;

const COUNTRY: Record<string, Partial<Record<Lang, string>>> = {
  VN: { vi: 'Việt Nam', en: 'Vietnam', zh: '越南', fr: 'Viêt Nam', es: 'Vietnam', ja: 'ベトナム', ko: '베트남' },
  CN: { vi: 'Trung Quốc', en: 'China', zh: '中国', fr: 'Chine', es: 'China', ja: '中国', ko: '중국' },
  US: { vi: 'Hoa Kỳ', en: 'United States', zh: '美国', fr: 'États-Unis', es: 'Estados Unidos', ja: 'アメリカ', ko: '미국' },
};
export const countryIn = (c: string | null, l: Lang) => (c ? COUNTRY[c]?.[l] ?? COUNTRY[c]?.vi ?? c : '—');

/** Dữ liệu truy xuất công khai theo SKU (chỉ sản phẩm đang bán). */
export async function traceBySku(sku: string) {
  return one(`SELECT p.id, p.sku, p.name, p.name_i18n, p.category, p.image_emoji, p.rynn_brain_pass, p.is_simulated, p.moq,
      p.price_taomua_10, p.price_taomua_50, p.price_taomua_100, p.price_taomua_500,
      s.name AS supplier_name, s.country, s.source, s.trust_score, s.defect_rate, s.on_time_rate, s.verified_cert,
      (SELECT max(recorded_at) FROM product_cost_history h WHERE h.product_id=p.id) AS source_updated
    FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE upper(p.sku)=upper($1) AND p.published`, [sku.slice(0, 60)]);
}
