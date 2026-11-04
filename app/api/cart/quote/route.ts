import { NextResponse } from 'next/server';
import { quoteCart } from '@/lib/quote';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const lines = Array.isArray(body?.lines) ? body.lines : [];
  return NextResponse.json(await quoteCart(lines.map((l: any) => ({ id: String(l?.id ?? ''), qty: Number(l?.qty) || 0 }))));
}
