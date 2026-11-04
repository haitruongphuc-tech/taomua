import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { OrderError } from './orders';

/** Chạy một thao tác quản trị rồi quay lại trang với thông báo. Lỗi nghiệp vụ hiện ra cho người dùng, lỗi khác ném tiếp. */
export async function runAction(back: string, fn: () => Promise<string | void>) {
  let msg: string | void;
  try {
    msg = await fn();
  } catch (e: any) {
    if (e instanceof OrderError || e?.message?.startsWith('Bạn không có quyền') || e?.userFacing) {
      redirect(`${back}${back.includes('?') ? '&' : '?'}loi=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
  revalidatePath(back.split('?')[0]);
  redirect(`${back}${back.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg || 'Đã lưu.')}`);
}

export class UserError extends Error { userFacing = true; }
