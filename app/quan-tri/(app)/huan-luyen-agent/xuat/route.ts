import { NextResponse } from 'next/server';
import { currentUser, can, actorOf } from '@/lib/auth';
import { trainingDataset } from '@/lib/training';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Tải bộ dữ liệu huấn luyện (JSONL) để tinh chỉnh mô hình AI. Chỉ CEO / Trưởng nhóm / Kỹ sư AI. */
export async function GET() {
  const u = await currentUser();
  if (!u || !can(u, 'agents.train')) return NextResponse.json({ error: 'Không có quyền.' }, { status: 403 });
  const { lines, stats } = await trainingDataset();
  await audit(actorOf(u), 'agent.export_training', 'agent_lesson', null, stats);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', {
    headers: { 'content-type': 'application/jsonl; charset=utf-8', 'content-disposition': `attachment; filename="taomua-huan-luyen-${day}.jsonl"` },
  });
}
