import Landing from '@/components/landing';
import { redirect } from 'next/navigation';
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (['workspace', 'billing', 'recovery', 'auth_error'].some(key => params[key])) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === 'string') query.set(key, value);
    redirect(`/portal?${query}`);
  }
  return <Landing />;
}
