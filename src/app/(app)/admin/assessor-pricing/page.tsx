export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { CORRETORAS, CORRETORA_LABEL } from '@/lib/corretoras'
import {
  listPricing, savePricing, deletePricing, listTiers, saveTiers,
  listPrecosProduto, savePrecosProduto, listBarrasSemTarifa,
} from './actions'
import { PricingView } from './View'

export default async function AssessorPricingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const [initial, sugestoes] = await Promise.all([
    listPricing(),
    listBarrasSemTarifa().catch(() => []),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Cadastros"
        title="Tarifas por barra"
        description="Preço por lote operado, modelo de zeragem, tarifa por produto e tarifa Bovespa de cada barra. As tarifas alimentam a receita estimada do painel e são casadas por corretora + nome da barra."
        stats={[
          { label: 'Tarifas ativas', value: initial.length },
          ...CORRETORAS.map(c => ({ label: CORRETORA_LABEL[c], value: initial.filter(r => r.corretora === c).length })),
          { label: 'Barras sem tarifa', value: sugestoes.length, sub: sugestoes.length > 0 ? 'com lotes e sem receita' : undefined },
        ]}
      />
      <PageBody>
        <PricingView
          initial={initial}
          sugestoes={sugestoes}
          actions={{ savePricing, deletePricing, listTiers, saveTiers, listPrecosProduto, savePrecosProduto }}
        />
      </PageBody>
    </>
  )
}
