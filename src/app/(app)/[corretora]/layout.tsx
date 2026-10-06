import { notFound, redirect } from 'next/navigation'
import { corretoraDoSlug, podeVerCorretora } from '@/lib/corretoras'
import { getProfile } from '@/lib/auth/getProfile'
import { CorretoraCookie } from './CorretoraCookie'

export default async function CorretoraLayout({ children, params }: { children: React.ReactNode; params: Promise<{ corretora: string }> }) {
  const { corretora: slug } = await params
  const corretora = corretoraDoSlug(slug)
  if (!corretora) notFound()
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.role !== 'vendedor') redirect('/dashboard')
  // Corretora fora da lista do usuário (profiles.corretoras): volta pro início
  if (!podeVerCorretora(profile, corretora)) redirect('/dashboard')
  return (
    <>
      <CorretoraCookie corretora={corretora} />
      {children}
    </>
  )
}
