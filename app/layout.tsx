import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Blood Bank | Management System', description: 'Academic blood-bank database project. Synthetic data only.' };
// Wraps every page: document metadata for the browser tab and the global stylesheet.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
