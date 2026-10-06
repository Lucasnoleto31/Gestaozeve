import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileOverlay } from '@/components/layout/MobileOverlay'
import { SidebarProvider } from '@/lib/sidebar-context'
import { ToastProvider } from '@/components/ui/Toast'
import { CORRETORA_COOKIE, isCorretora } from '@/lib/corretoras'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  // Última corretora aberta (o menu aponta pra ela fora das rotas de corretora)
  const cookieStore = await cookies()
  const salva = cookieStore.get(CORRETORA_COOKIE)?.value
  const corretoraPadrao = isCorretora(salva) ? salva : 'GENIAL'

  return (
    <SidebarProvider>
      <ToastProvider>
      <div className="min-h-screen bg-bg">
        <Sidebar role={profile.role} nome={profile.nome} corretoraPadrao={corretoraPadrao} />
        <MobileOverlay />
        <div className="flex min-h-screen flex-col lg:pl-60">
          <TopBar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </ToastProvider>
    </SidebarProvider>
  )
}
