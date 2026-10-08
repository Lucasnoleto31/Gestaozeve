import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { TopBar } from '@/components/layout/TopBar'
import { MobileOverlay } from '@/components/layout/MobileOverlay'
import { BottomNav } from '@/components/layout/BottomNav'
import { InstalarApp } from '@/components/layout/InstalarApp'
import { SidebarProvider } from '@/lib/sidebar-context'
import { ToastProvider } from '@/components/ui/Toast'
import { CORRETORA_COOKIE, corretorasDoPerfil, isCorretora } from '@/lib/corretoras'
import { hojeBrasil } from '@/lib/periodo'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  // Corretoras que este usuário vê e a última aberta (o menu aponta pra ela fora das rotas de corretora)
  const permitidas = corretorasDoPerfil(profile)
  const cookieStore = await cookies()
  const salva = cookieStore.get(CORRETORA_COOKIE)?.value
  const corretoraPadrao = isCorretora(salva) && permitidas.includes(salva) ? salva : (permitidas[0] ?? 'GENIAL')
  // Data de hoje no cabeçalho (calculada aqui para servidor e cliente mostrarem a mesma)
  const dataHoje = hojeBrasil().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <SidebarProvider>
      <ToastProvider>
      <div className="min-h-screen bg-bg">
        <Sidebar role={profile.role} nome={profile.nome} corretoraPadrao={corretoraPadrao} corretoras={permitidas} />
        <MobileOverlay />
        <div className="com-barra-inferior flex min-h-screen flex-col">
          <Header role={profile.role} nome={profile.nome} corretoraPadrao={corretoraPadrao} corretoras={permitidas} dataHoje={dataHoje} />
          <TopBar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        <BottomNav role={profile.role} corretoraPadrao={corretoraPadrao} />
        <InstalarApp />
      </div>
    </ToastProvider>
    </SidebarProvider>
  )
}
