// Chat & huấn luyện 7 agent, AI LOCAL (BM25 + Naive Bayes), bài học mặc định 24/7, dữ liệu huấn luyện.
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, q, one } from '@/lib/db';
import { parseCommand, matchLesson, talkToAgent } from '@/lib/agent-chat';
import { Bm25, NaiveBayes, INTENT_EXAMPLES, features } from '@/lib/local-ai';
import { resetLocalAi } from '@/lib/lessons';
import { trainingDataset } from '@/lib/training';
import { answer } from '@/lib/cskh';
import type { User } from '@/lib/auth';

describe('đọc lệnh', () => {
  it('hiểu các lệnh tiếng Việt có dấu / không dấu', () => {
    expect(parseCommand('dạy: luôn chào khách bằng "taomua xin chào"')).toEqual({ cmd: 'DAY', text: 'luôn chào khách bằng "taomua xin chào"' });
    expect(parseCommand('Quy tắc: không giảm giá quá 5%')).toEqual({ cmd: 'DAY', text: 'không giảm giá quá 5%' });
    expect(parseCommand('hỏi: có giao chủ nhật không => Có, nội thành HCM')).toEqual({ cmd: 'HOI_DAP', question: 'có giao chủ nhật không', answer: 'Có, nội thành HCM' });
    expect(parseCommand('hoi: in logo duoc khong | đáp: Được, từ 100 cái')).toEqual({ cmd: 'HOI_DAP', question: 'in logo duoc khong', answer: 'Được, từ 100 cái' });
    expect(parseCommand('quên #12')).toEqual({ cmd: 'QUEN', id: 12 });
    expect(parseCommand('Đã học gì')).toEqual({ cmd: 'DA_HOC' });
    expect(parseCommand('Chạy ngay')).toEqual({ cmd: 'CHAY' });
    expect(parseCommand('Báo cáo')).toEqual({ cmd: 'BAO_CAO' });
    expect(parseCommand('Nhiệm vụ của bạn')).toEqual({ cmd: 'NHIEM_VU' });
    expect(parseCommand('Tuần này nên nhập gì?')).toEqual({ cmd: 'TU_DO', text: 'Tuần này nên nhập gì?' });
  });
  it('khớp câu hỏi mẫu khi khách hỏi gần giống, không khớp nhầm vì từ hỏi có / không', () => {
    const ls = [{ id: 1, question: 'Có giao hàng chủ nhật không?' }, { id: 2, question: 'In logo riêng được không' }];
    expect(matchLesson('shop ơi chủ nhật có giao hàng không ạ', ls)?.id).toBe(1);
    expect(matchLesson('in logo riêng lên hộp được không', ls)?.id).toBe(2);
    expect(matchLesson('có giao hàng tỉnh không', ls)).toBeNull();
    expect(matchLesson('giá áo thun bao nhiêu', ls)).toBeNull();
  });
});

describe('AI LOCAL thuật toán', () => {
  it('tách từ ghép tiếng Việt, bỏ dấu và từ dừng', () => {
    const f = features('Shop ơi, chủ nhật có giao hàng không?');
    expect(f).toEqual(expect.arrayContaining(['chu', 'nhat', 'giao', 'hang', 'chu_nhat', 'giao_hang']));
    expect(f).not.toContain('shop');
    expect(f).not.toContain('co');
  });
  it('BM25 xếp đúng tài liệu liên quan nhất, kèm độ khớp', () => {
    const idx = new Bm25([
      { id: 'cn', text: 'Có, giao cả chủ nhật', boost: 'Có giao hàng chủ nhật không' },
      { id: 'vat', text: 'Xuất hóa đơn VAT 8%', boost: 'Có xuất hóa đơn đỏ không' },
      { id: 'ship', text: 'Phí ship tính theo cân nặng', boost: 'Phí vận chuyển bao nhiêu' },
    ]);
    const r = idx.search('chủ nhật bên bạn giao hàng không');
    expect(r[0].id).toBe('cn');
    expect(r[0].match).toBe(1);
    expect(idx.search('xuất hóa đơn công ty')[0].id).toBe('vat');
    expect(idx.search('xin chào')).toEqual([]);
  });
  it('Naive Bayes phân loại ý định câu khách chưa gặp', () => {
    const nb = new NaiveBayes().train(INTENT_EXAMPLES);
    expect(nb.predict('mình muốn trả lại hàng vì bị vỡ')?.label).toBe('KHIEU_NAI');
    expect(nb.predict('ship ra Hà Nội mất mấy ngày')?.label).toBe('VAN_CHUYEN');
    expect(nb.predict('trả bằng momo được không')?.label).toBe('THANH_TOAN');
    const p = nb.predict('mua 200 cái thì giá bao nhiêu');
    expect(p?.label).toBe('GIA');
    expect(p!.prob).toBeGreaterThan(0.5);
  });
});

describe('trên database', () => {
  let ceo: User;
  beforeAll(async () => {
    await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await q(fs.readFileSync('db/schema.sql', 'utf8'));
    resetLocalAi();
    ceo = (await one("INSERT INTO users(email,name,role,password_hash) VALUES ('c@t','CEO','CEO','x') RETURNING id, email, name, role"))!;
  });
  afterAll(async () => { await pool.end(); });

  it('kỹ sư AI là một vai trò hợp lệ; chạy lại lược đồ không nhân đôi bài học mặc định', async () => {
    await q("INSERT INTO users(email,name,role,password_hash) VALUES ('ks@t','Kỹ sư','KY_SU','x')");
    const n = (await one('SELECT count(*)::int AS n FROM agent_lessons'))!.n;
    expect(n).toBeGreaterThanOrEqual(20);
    await q(fs.readFileSync('db/schema.sql', 'utf8'));
    expect((await one('SELECT count(*)::int AS n FROM agent_lessons'))!.n).toBe(n);
  });

  it('bài mặc định: khách hỏi giao chủ nhật / làm việc 24/7 → AI trả lời ngay', async () => {
    expect((await answer('shop ơi chủ nhật có giao hàng không ạ')).reply).toMatch(/24\/7.*chủ nhật/s);
    const r = await answer('ban đêm taomua có làm việc không');
    expect(r.reply).toContain('24/7');
    expect(r.lessonId).toBeTruthy();
    // không khớp nhầm câu khác
    expect((await answer('có giao hàng tỉnh không')).reply).not.toContain('chủ nhật');
    expect((await answer('mua lẻ ship về Cần Thơ')).reply).not.toContain('lễ tết');
    expect((await answer('khi nhận hàng bị lỗi thì sao')).intent).toBe('KHIEU_NAI');
    expect((await answer('khi nhận hàng bị lỗi thì sao')).answeredBy).toBe('CHUYEN_NGUOI');
  });

  it('câu tự do không có từ khóa → Naive Bayes đoán ý định, ghi intent_by AI_LOCAL', async () => {
    const r = await answer('đồ bị bể hết rồi, xử lý sao đây');
    expect(r.intent).toBe('KHIEU_NAI');
    expect(r.intentBy).toBe('AI_LOCAL');
  });

  it('dạy CSKH câu mới → khách hỏi ở khung chat cửa hàng được trả lời; quên thì thôi', async () => {
    const r = await talkToAgent('RYN-SALES', 'hỏi: có bán hàng cho Campuchia không => Có, taomua giao sang Campuchia 5–7 ngày.', ceo);
    expect(r.mode).toBe('LENH');
    expect(r.id).toBeGreaterThan(0);
    expect((await answer('bán hàng cho Campuchia được không shop')).reply).toBe('Có, taomua giao sang Campuchia 5–7 ngày.');
    const id = (await one("SELECT id FROM agent_lessons WHERE question LIKE '%Campuchia%'"))!.id;
    await talkToAgent('RYN-SALES', `quên #${id}`, ceo);
    expect((await answer('bán hàng cho Campuchia được không shop')).reply).not.toContain('5–7 ngày');
  });

  it('chat agent: dạy quy tắc, hỏi đã học gì; câu tự do trả lời bằng AI LOCAL khi chưa có khóa', async () => {
    await talkToAgent('RYN-PRICE', 'dạy: không bao giờ giảm quá 5% một lần', ceo);
    expect((await talkToAgent('RYN-PRICE', 'đã học gì', ceo)).reply).toContain('không bao giờ giảm quá 5% một lần');
    const free = await talkToAgent('RYN-PRICE', 'giá bán được tính thế nào vậy', ceo);
    expect(free.mode).toBe('LENH'); // khớp bài mặc định "Giá bán được tính thế nào"
    expect(free.reply).toContain('VAT 8%');
    const local = await talkToAgent('RYN-PRICE', 'giảm giá tối đa mỗi lần là bao nhiêu', ceo);
    expect(local.mode).toBe('AI_LOCAL');
    const unknown = await talkToAgent('RYN-PRICE', 'thời tiết hôm nay', ceo);
    expect(unknown.mode).toBe('AI_LOCAL');
    expect(unknown.reply).toContain('chưa được dạy');
  });

  it('ra lệnh "chạy" thì agent chạy thật và báo kết quả', async () => {
    const r = await talkToAgent('RYN-LOGI', 'chạy', ceo);
    expect(r.reply).toMatch(/^Đã chạy xong/);
    expect(await one('SELECT 1 AS x FROM agent_runs')).toBeTruthy();
  });

  it('dữ liệu huấn luyện JSONL: bài hỏi - đáp, câu được chấm 👍, câu khách AI trả lời bằng bài học', async () => {
    const r = await talkToAgent('RYN-LOGI', 'báo cáo', ceo);
    await q('UPDATE agent_chat SET rating=1 WHERE id=$1', [r.id]);
    await q("INSERT INTO chat_logs(session, message, reply, intent, answered_by, lesson_id) VALUES ('s','chủ nhật giao không','Có ạ','VAN_CHUYEN','AI_QUY_TAC',1)");
    const d = await trainingDataset();
    expect(d.stats.cham_tot).toBe(1);
    expect(d.stats.khach_that).toBe(1);
    expect(d.stats.hoi_dap).toBeGreaterThanOrEqual(10);
    const l = d.lines[0].messages;
    expect(l.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    expect(l[0].content).toContain('Quy tắc');
  });
});
