export const dynamic = 'force-dynamic'

// Extrato mensal do parceiro para imprimir ou salvar em PDF (S48): página limpa, sempre clara e sem
// a navegação do sistema. Abre a partir da tela Comissões (?parceiro=&mes=AAAA-MM&corretora=&receita=0).
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { comissaoCarteiraMes, parceirosLista } from '@/lib/gestao/consultas'
import { normTexto } from '@/lib/texto'
import { mesAtual, mesCurto, mesLongo, parseMes } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'
import { totaisExtrato } from '@/lib/gestao/extrato'
import { fmtNum } from '@/lib/format'
import { hojeBrasil } from '@/lib/periodo'
import { Marca } from '@/components/ui/Marca'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { rCurto } from '@/components/gestao/Celulas'
import { TabelaExtrato } from '@/components/gestao/TabelaExtrato'
import { BotaoImprimir } from './BotaoImprimir'

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/login')
  const sp = await searchParams
  const q = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const parceiros = await parceirosLista()
  const pedido = normTexto(q('parceiro'))
  const parceiro = (parceiros.find(p => normTexto(p.nome) === pedido) ?? parceiros[0])?.nome ?? null
  if (!parceiro) redirect('/comissoes')
  const corretoraParam = q('corretora')
  const corretora = isCorretora(corretoraParam) ? corretoraParam : null
  const mesRef = parseMes(q('mes')) ?? mesAtual()
  const comReceita = q('receita') !== '0'
  const linhas = await comissaoCarteiraMes(parceiro, corretora, mesRef)
  const t = totaisExtrato(linhas)
  const emitido = hojeBrasil().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="claro min-h-screen bg-bg text-fg" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-5xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="flex items-center gap-2"><Marca className="h-6 w-8" /><span className="text-section font-semibold">Zeve Controle</span></div>
            <h1 className="mt-4 text-title font-bold">Extrato de {parceiro}</h1>
            <p className="mt-1 text-dense text-fg-muted">
              {mesLongo(mesRef)}{corretora ? ` · ${CORRETORA_LABEL[corretora]}` : ' · todas as corretoras'} · emitido em {emitido}
            </p>
          </div>
          <BotaoImprimir />
        </header>

        <KpiRow cols={comReceita ? 3 : 2} className="my-6">
          <KpiCard label="Contas na carteira" value={fmtNum(t.contas)} sub={`${fmtNum(t.giraram)} ${t.giraram === 1 ? 'girou' : 'giraram'} em ${mesCurto(mesRef)}`} />
          <KpiCard label={`Lotes em ${mesCurto(mesRef)}`} value={fmtNum(t.lotes_mes)} sub={`${fmtNum(t.lotes_12m)} nos 12 meses até ${mesCurto(mesRef)}`} />
          {comReceita && <KpiCard label={`Receita bruta em ${mesCurto(mesRef)}`} value={rCurto(t.receita_mes)} sub={`${rCurto(t.receita_12m)} nos 12 meses`} />}
        </KpiRow>

        <div className="tbl-wrap">
          <TabelaExtrato linhas={linhas} comReceita={comReceita} impressao vazio={`Nenhuma conta na carteira de ${parceiro}${corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''}.`} />
        </div>

        <p className="mt-6 text-label text-fg-subtle">
          Contas atribuídas ao parceiro: lead ganho, parceiro informado na ficha, assessor ligado ao parceiro ou responsável interno.
          Lotes = contratos operados no mês, pelo relatório da corretora.{comReceita ? ' Receita bruta = corretagem, zeragem e operações avulsas, antes de repasse e impostos.' : ''}
        </p>
      </div>
    </div>
  )
}
