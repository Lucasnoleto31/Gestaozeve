export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { corretorasDoPerfil } from '@/lib/corretoras'
import { janelaMeses, mesAtual, mesCurto, mesLongo, parseMes } from '@/lib/gestao/meses'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { MesPicker, SegParam } from '@/components/gestao/Filtros'
import { Abas } from '@/components/gestao/Abas'
import { AbaMes } from './AbaMes'
import { AbaEquipe } from './AbaEquipe'
import { AbaOrigens } from './AbaOrigens'
import { AbaHistorico } from './AbaHistorico'
import type { PeriodoFunil } from './comum'

const ABAS = [
  { valor: 'mes', label: 'Mês' },
  { valor: 'equipe', label: 'Equipe' },
  { valor: 'origens', label: 'Origens' },
  { valor: 'historico', label: 'Histórico' },
]

// O Funil em quatro abas, uma pergunta por aba: Mês (o que fechou e onde estão os leads do mês),
// Equipe (quem fez o quê), Origens (de onde vêm e quanto rendem) e Histórico (12 meses). Cada aba
// carrega só as consultas dela. Vocabulário do escritório: tombou = abriu a conta; ativado = 1ª operação.
export default async function FunilPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/dashboard')
  const sp = await searchParams
  const q = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const mesRef = parseMes(q('mes')) ?? mesAtual()
  const aba = ABAS.some(a => a.valor === q('aba')) ? q('aba') : 'mes'
  // Equipe olha o mês por padrão; Origens precisa de volume para comparar: 12 meses por padrão
  const periodoPadrao: PeriodoFunil = aba === 'origens' ? '12m' : 'mes'
  const periodo: PeriodoFunil = q('periodo') === '12m' ? '12m' : q('periodo') === 'mes' ? 'mes' : periodoPadrao
  const comPeriodo = aba === 'equipe' || aba === 'origens'
  const meses = janelaMeses(mesRef, 12)
  const descricao: Record<string, string> = {
    mes: `O que fechou em ${mesLongo(mesRef)} e onde estão hoje os leads que entraram nele.`,
    equipe: 'Quem fez o quê: leads por responsável, contatos com leads e clientes e a campanha de ativação.',
    origens: 'De onde vêm os leads e quanto cada origem rendeu em contas abertas, operações e receita.',
    historico: `Os 12 meses de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}: resultado de cada mês e o destino dos leads de cada mês de entrada.`,
  }

  return (
    <>
      <PageHeader eyebrow="Leads · todas as corretoras" title="Funil" description={descricao[aba]}
        actions={<>
          {comPeriodo && <SegParam param="periodo" valor={periodo} opcoes={[{ valor: 'mes', label: 'Só o mês' }, { valor: '12m', label: '12 meses' }]} />}
          <MesPicker valor={mesRef} label="Mês" />
        </>}>
        <Abas caminho="/funil" query={{ mes: q('mes') ? mesRef.slice(0, 7) : null }} valor={aba} opcoes={ABAS} padrao="mes" rotulo="Seções do funil" />
      </PageHeader>
      <PageBody>
        {aba === 'mes' && <AbaMes mesRef={mesRef} corretoras={corretorasDoPerfil(profile)} />}
        {aba === 'equipe' && <AbaEquipe mesRef={mesRef} periodo={periodo} />}
        {aba === 'origens' && <AbaOrigens mesRef={mesRef} periodo={periodo} />}
        {aba === 'historico' && <AbaHistorico mesRef={mesRef} />}
      </PageBody>
    </>
  )
}
