import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server';
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get('code');
  if (code) { const db = await serverDb(); const { error } = await db.auth.exchangeCodeForSession(code); if (!error) return NextResponse.redirect(new URL(url.searchParams.get('recovery') === '1' ? '/?recovery=1' : '/', url.origin)); }
  return NextResponse.redirect(new URL('/?auth_error=invalid_link', url.origin));
}
