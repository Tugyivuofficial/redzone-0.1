import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RedZone Arena',
  description: 'Standoff-style tournament, teams, matches and result verification.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
