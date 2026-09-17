export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { DashboardShell } from './_lib/Shell'

export default async function ContratosDashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  return <DashboardShell>{children}</DashboardShell>
}
