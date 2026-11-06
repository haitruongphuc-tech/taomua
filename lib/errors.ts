import { q } from './db';

/** Ghi lỗi hệ thống vào app_errors để xem ở Quản trị → Lỗi & phản hồi trong giai đoạn chạy thật. Không bao giờ ném lỗi. */
export async function logError(place: string, e: unknown, detail: Record<string, unknown> = {}) {
  const err = e as any;
  console.error(`[${place}]`, err);
  try {
    await q('INSERT INTO app_errors(place, message, detail) VALUES ($1,$2,$3)',
      [place.slice(0, 200), String(err?.message ?? err).slice(0, 1000), JSON.stringify({ ...detail, stack: String(err?.stack ?? '').slice(0, 2000) })]);
  } catch { /* database lỗi thì chỉ còn console */ }
}
