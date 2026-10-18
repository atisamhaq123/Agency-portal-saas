import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'ClientNest — A little more together', description: 'Your agency, projects, files, and client approvals. One calm workspace.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Browser extensions may add body attributes before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
