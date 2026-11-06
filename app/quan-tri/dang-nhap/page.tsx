import { redirect } from 'next/navigation';
import { login, currentUser } from '@/lib/auth';
import Logo from '@/components/Logo';
import { SLOGANS } from '@/lib/slogans';

export const metadata = { title: 'Đăng nhập quản trị' };
export const dynamic = 'force-dynamic';

async function doLogin(fd: FormData) {
  'use server';
  const r = await login(String(fd.get('email') ?? ''), String(fd.get('password') ?? ''));
  if (!r.ok) redirect(`/quan-tri/dang-nhap?loi=${encodeURIComponent(r.error)}`);
  redirect('/quan-tri');
}

export default async function LoginPage({ searchParams }: { searchParams: { loi?: string } }) {
  if (await currentUser()) redirect('/quan-tri');
  return (
    <main className="wrap page" style={{ maxWidth: 420 }}>
      <form action={doLogin} className="card stack">
        <div style={{ textAlign: 'center' }}><Logo variant="full" size={150} /></div>
        <div className="slogan-inline" style={{ textAlign: 'center' }}>{SLOGANS.vui}</div>
        <h1 style={{ textAlign: 'center' }}>Đăng nhập quản trị</h1>
        {searchParams.loi && <div className="alert bad">{searchParams.loi.slice(0, 200)}</div>}
        <label className="field">Email<input name="email" type="email" required autoComplete="username" /></label>
        <label className="field">Mật khẩu<input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn blue">Đăng nhập</button>
      </form>
    </main>
  );
}
