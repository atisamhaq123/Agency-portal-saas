import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server';
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get('code');
  if (code) {
    const db = await serverDb(); const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = new URL('/', url.origin);
      for (const key of ['recovery', 'role', 'workspace']) { const value = url.searchParams.get(key); if (value) destination.searchParams.set(key, value); }
      return NextResponse.redirect(destination);
    }
  }
  return NextResponse.redirect(new URL('/?auth_error=invalid_link', url.origin));
}
