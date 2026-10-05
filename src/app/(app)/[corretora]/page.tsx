import { redirect } from 'next/navigation'

export default async function CorretoraIndex({ params }: { params: Promise<{ corretora: string }> }) {
  const { corretora } = await params
  redirect(`/${corretora}/painel`)
}
