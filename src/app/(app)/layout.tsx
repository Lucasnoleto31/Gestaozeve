import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()

  if (!profile) {
    redirect('/login')
  }

  return (
    <div className="flex h-full min-h-screen" style={{ background: 'var(--background)' }}>
      <Sidebar role={profile.role} nome={profile.nome} />
      <div className="flex-1 flex flex-col ml-64 min-w-0">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
