import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'INTOP — Internship + Job Opportunity',
  description: 'Discover internships, jobs, hackathons and career opportunities in one intelligent platform. Discover. Apply. Grow.',
  applicationName: 'INTOP',
  keywords: ['internships', 'jobs', 'hackathons', 'career opportunities', 'students', 'INTOP'],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
