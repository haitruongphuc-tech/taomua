import { requireUser } from '@/lib/auth';

const APIS: [string, string, string][] = [
  ['POST /api/v1/pricing-engine/calculate', 'Tính biên ròng sau thuế, phí và cấp duyệt', 'Chạy được'],
  ['POST /api/v1/supplier-brain/trust-score', 'Tính TrustScore (5 yếu tố tạm thời)', 'Chạy được'],
  ['POST /api/v1/approval/telegram', 'Gửi yêu cầu duyệt qua Telegram', 'Chạy được khi có bot'],
  ['GET /api/v1/agent-gateway/shop-md', 'Danh mục cho AI agent đọc và đặt hàng', 'Chạy được'],
  ['POST /api/v1/agent-gateway/profiles', 'Hạn mức chi cho AI agent 10/50/100 triệu', 'Chạy được'],
  ['POST /api/v1/wfs/fulfillment', 'Chọn hình thức giao hàng', 'Chạy được'],
  ['POST /api/v1/trade-assurance/hold', 'Ghi nhận tiền và giữ tiền', 'Chạy được'],
  ['POST /api/v1/latr/test', 'Ghi kết quả bán thử 50-100 cái', 'Chạy được'],
  ['POST /api/v1/working-capital/calculate', 'Vốn cần 30% + 15%', 'Chạy được'],
  ['POST /api/v1/trend-hunter/scan', 'Quét xu hướng (Qwen, RynnBrain, Accio)', 'Chờ tài liệu API'],
  ['POST /api/v1/supplier-brain/find', 'Tìm 50 xưởng mỗi sản phẩm', 'Chờ tài liệu API'],
  ['POST /api/v1/rynn-brain/check', 'Kiểm lỗi bằng camera', 'Chờ tài liệu API'],
  ['POST /api/v1/scintilla/analytics', 'Phân tích bán hàng', 'Chờ tài liệu API'],
  ['POST /api/v1/canvas/edit', 'Sửa giao diện bằng lời', 'Chờ tài liệu API'],
];

export default async function AiServices() {
  await requireUser();
  return (
    <div className="stack">
      <h1>Dịch vụ AI và API</h1>
      <div className="alert warn">Các dịch vụ AI trong spec (Qwen3.7-Max, RynnBrain, Accio) không có gói npm công khai. Các API cần chúng đang trả mã 501 thay vì dữ liệu giả, cho tới khi có tài liệu API. Không gửi API key qua chat; đặt trong biến môi trường.</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Endpoint</th><th>Việc</th><th>Tình trạng</th></tr></thead>
        <tbody>{APIS.map(([e, d, s]) => (
          <tr key={e}><td className="mono small">{e}</td><td>{d}</td><td><span className={`badge ${s === 'Chạy được' ? 'ok' : 'warn'}`}>{s}</span></td></tr>
        ))}</tbody>
      </table></div>
      <p className="muted small">API nội bộ nhận phiên đăng nhập quản trị, hoặc header <code>x-api-key</code> bằng biến INTERNAL_API_KEY (dùng cho n8n). Quy trình n8n gốc nằm trong <code>docs/goc/N8N_7_Agents_Workflow.json</code>.</p>
    </div>
  );
}
