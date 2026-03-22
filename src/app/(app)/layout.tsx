import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { Sidebar } from '@/components/layout/Sidebar'
import { SidebarProvider } from '@/lib/sidebar-context'
import { MobileOverlay } from '@/components/layout/MobileOverlay'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()

  if (!profile) {
    redirect('/login')
  }

  return (
    <SidebarProvider>
      <div className="flex h-full min-h-screen" style={{ background: 'var(--background)' }}>
        <Sidebar role={profile.role} nome={profile.nome} />
        <MobileOverlay />
        <div className="flex-1 flex flex-col lg:ml-64 min-w-0">
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
