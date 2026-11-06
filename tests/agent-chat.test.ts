// Chat & huấn luyện 7 agent: đọc lệnh, dạy quy tắc / câu hỏi - đáp, CSKH dùng câu đã dạy để trả lời khách.
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, q, one } from '@/lib/db';
import { parseCommand, matchLesson, talkToAgent } from '@/lib/agent-chat';
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
  it('khớp câu hỏi mẫu khi khách hỏi gần giống', () => {
    const ls = [{ id: 1, question: 'Có giao hàng chủ nhật không?' }, { id: 2, question: 'In logo riêng được không' }];
    expect(matchLesson('shop ơi chủ nhật có giao hàng không ạ', ls)?.id).toBe(1);
    expect(matchLesson('in logo công ty lên hộp được không', ls)?.id).toBe(2);
    expect(matchLesson('giá áo thun bao nhiêu', ls)).toBeNull();
  });
});

describe('trên database', () => {
  let ceo: User;
  beforeAll(async () => {
    await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await q(fs.readFileSync('db/schema.sql', 'utf8'));
    ceo = (await one("INSERT INTO users(email,name,role,password_hash) VALUES ('c@t','CEO','CEO','x') RETURNING id, email, name, role"))!;
  });
  afterAll(async () => { await pool.end(); });

  it('kỹ sư AI là một vai trò hợp lệ', async () => {
    await q("INSERT INTO users(email,name,role,password_hash) VALUES ('ks@t','Kỹ sư','KY_SU','x')");
  });

  it('dạy CSKH câu trả lời → khách hỏi ở khung chat cửa hàng được trả lời đúng; quên thì thôi', async () => {
    const before = await answer('Shop có giao hàng chủ nhật không?');
    expect(before.reply).not.toContain('nội thành HCM giao cả chủ nhật');
    const r = await talkToAgent('RYN-SALES', 'hỏi: có giao hàng chủ nhật không => Có, nội thành HCM giao cả chủ nhật.', ceo);
    expect(r.mode).toBe('LENH');
    const after = await answer('shop ơi chủ nhật có giao hàng không ạ');
    expect(after.reply).toBe('Có, nội thành HCM giao cả chủ nhật.');
    expect((await one("SELECT used FROM agent_lessons WHERE kind='HOI_DAP'"))!.used).toBe(1);
    const id = (await one("SELECT id FROM agent_lessons WHERE kind='HOI_DAP'"))!.id;
    await talkToAgent('RYN-SALES', `quên #${id}`, ceo);
    expect((await answer('shop ơi chủ nhật có giao hàng không ạ')).reply).not.toBe('Có, nội thành HCM giao cả chủ nhật.');
  });

  it('dạy quy tắc, hỏi đã học gì, câu tự do trả lời GIẢ LẬP khi chưa có AI; lưu cả hai chiều', async () => {
    await talkToAgent('RYN-PRICE', 'dạy: không bao giờ giảm quá 5% một lần', ceo);
    const r = await talkToAgent('RYN-PRICE', 'đã học gì', ceo);
    expect(r.reply).toContain('không bao giờ giảm quá 5% một lần');
    const free = await talkToAgent('RYN-PRICE', 'Tuần này nên tăng giá món nào?', ceo);
    expect(free.mode).toBe('GIA_LAP');
    expect(free.reply).toContain('GIẢ LẬP');
    expect((await q("SELECT sender FROM agent_chat WHERE agent='RYN-PRICE'")).length).toBe(6);
  });

  it('ra lệnh "chạy" thì agent chạy thật và báo kết quả', async () => {
    const r = await talkToAgent('RYN-LOGI', 'chạy', ceo);
    expect(r.reply).toMatch(/^Đã chạy xong/);
    expect(await one("SELECT 1 AS x FROM agent_runs")).toBeTruthy();
  });
});
