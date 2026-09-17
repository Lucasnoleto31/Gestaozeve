import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileOverlay } from '@/components/layout/MobileOverlay'
import { SidebarProvider } from '@/lib/sidebar-context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-bg">
        <Sidebar role={profile.role} nome={profile.nome} />
        <MobileOverlay />
        <div className="flex min-h-screen flex-col lg:pl-60">
          <TopBar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}
