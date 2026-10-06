export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { parametrosDaCorretora } from '@/lib/gestao/consultas'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Parametros } from './Parametros'

export default async function ParametrosPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const profile = await getProfile()
  if (profile?.role !== 'admin') redirect(`${ctx.base}/painel`)
  const dados = await parametrosDaCorretora(ctx.corretora)
  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Parâmetros"
        description={`Premissas da ${ctx.label}: assessores, status da conta, incentivo, consolidados, leads e responsáveis. Toda mudança recalcula os lotes na hora.`}
      />
      <PageBody>
        <Parametros corretora={ctx.corretora} label={ctx.label} dados={dados} />
      </PageBody>
    </>
  )
}
