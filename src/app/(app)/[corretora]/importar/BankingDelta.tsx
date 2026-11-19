'use client'

// Banking do mês na tela: sobe a planilha de Banking que a Delta manda ("Artur Fonseca_DW_<mês>.xlsx"),
// o sistema lê cada bloco (cartão, saldo remunerado…), a parte do escritório e o imposto, e grava o mês.
// É uma comissão à parte do giro: aparece no Painel, não mexe em lotes. Um clique grava, outro desfaz.
import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileSpreadsheet, Undo2 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Dica } from '@/components/ui/Dica'
import { useToast } from '@/components/ui/Toast'
import { TRACO, n0, r0 } from '@/components/gestao/Celulas'
import { lerAbas } from '@/lib/gestao/lerArquivo'
import { FONTE_ROTULO, lerBankingDelta, type GrupoBanking, type LeituraBanking, type TotaisBanking } from '@/lib/gestao/banking'
import { aplicarBankingBtg, tirarReceitaExtraBtg } from '@/lib/gestao/acoesBanking'
import type { ExtraAplicado } from '@/lib/gestao/consultasBanking'
import { mesLongo } from '@/lib/gestao/meses'
import { fmtDataHoraPt, fmtPct } from '@/lib/format'
import type { Corretora } from '@/lib/corretoras'
import { cn } from '@/lib/utils'

// as explicações dos blocos: no computador como subtítulo, no celular atrás do "i"
const AJUDA_BANKING = 'A planilha de Banking que a Delta manda (“Artur Fonseca_DW_<mês>.xlsx”): cartão, saldo remunerado e outros produtos bancários. É uma comissão à parte do giro: entra no Painel e não mexe nos lotes.'
const AJUDA_GRAVADOS = 'Um registro por mês e por tipo, com as linhas da planilha guardadas: o fora do giro vem do Fechamento do mês e o Banking, da planilha da Delta. Tirar só remove a comissão do Painel.'

type Lido = Extract<LeituraBanking, { ok: true }>
type Estado =
  | { fase: 'vazio' }
  | { fase: 'lendo' }
  | { fase: 'erro'; erro: string }
  | { fase: 'lido'; nome: string; leitura: Lido; erro?: string }
  | { fase: 'gravando'; nome: string; leitura: Lido }
  | { fase: 'gravado'; mes: string; liquida: number; substituidos: number }

const pct = (v: number) => fmtPct(v, Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2)

// aplicados = os meses gravados das duas receitas fora dos lotes: o Banking (daqui) e o fora do giro (do Fechamento do mês)
export function BankingDelta({ corretora, base, aplicados }: { corretora: Corretora; base: string; aplicados: ExtraAplicado[] }) {
  const router = useRouter()
  const { avisar } = useToast()
  const [estado, setEstado] = useState<Estado>({ fase: 'vazio' })
  const [desfazendo, setDesfazendo] = useState<string | null>(null)
  const [erroDesfazer, setErroDesfazer] = useState<string | null>(null)
  const ocupado = estado.fase === 'lendo' || estado.fase === 'gravando'

  const escolher = async (file: File | null) => {
    if (!file) return
    setEstado({ fase: 'lendo' })
    try {
      const r = lerBankingDelta(await lerAbas(file))
      if (!r.ok) { setEstado({ fase: 'erro', erro: r.erro }); return }
      setEstado({ fase: 'lido', nome: file.name, leitura: r })
    } catch (e) {
      setEstado({ fase: 'erro', erro: e instanceof Error ? e.message : 'Não consegui ler o arquivo' })
    }
  }

  const gravar = async () => {
    if (estado.fase !== 'lido') return
    const { nome, leitura } = estado
    setEstado({ fase: 'gravando', nome, leitura })
    const r = await aplicarBankingBtg(corretora, {
      mes: leitura.mes, origem: nome, itens: leitura.itens,
      percentuais: leitura.grupos.map(g => ({ grupo: g.grupo, pctEscritorio: g.pctEscritorio, impostoPct: g.impostoPct })),
    })
    if (!r.ok) { setEstado({ fase: 'lido', nome, leitura, erro: r.erro }); return }
    setEstado({ fase: 'gravado', mes: leitura.mes, liquida: r.dados.total.liquida, substituidos: r.dados.substituidos })
    avisar({ titulo: `Banking de ${mesLongo(leitura.mes)} gravado`, detalhe: `${r0(r.dados.total.liquida)} de comissão líquida`, tom: 'gain' })
    router.refresh()
  }

  const desfazer = async (a: ExtraAplicado) => {
    const rotulo = a.fonte === 'banking' ? 'o Banking' : 'o fora do giro'
    if (!confirm(`Tirar ${rotulo} de ${mesLongo(a.dados.mes)}?\n\nA comissão líquida de ${r0(a.dados.total.liquida)} sai do Painel. Os lotes não mudam.`)) return
    setDesfazendo(a.id); setErroDesfazer(null)
    const r = await tirarReceitaExtraBtg(corretora, a.id)
    setDesfazendo(null)
    if (!r.ok) { setErroDesfazer(r.erro); return }
    avisar({ titulo: `${FONTE_ROTULO[a.fonte]} retirado`, detalhe: mesLongo(a.dados.mes), tom: 'neutral' })
    if (estado.fase === 'gravado') setEstado({ fase: 'vazio' })
    router.refresh()
  }

  const jaGravado = estado.fase === 'lido' || estado.fase === 'gravando' ? aplicados.find(a => a.fonte === 'banking' && a.dados.mes === estado.leitura.mes) : undefined

  return (
    <>
      {/* no celular o parágrafo técnico vai para o "i" e o botão de escolher a planilha ocupa a largura toda */}
      <Panel variant="card" title="Banking do mês" subtitle={<>
        <span className="max-md:hidden">{AJUDA_BANKING}</span>
        <span className="md:hidden">A planilha de Banking da Delta. <Dica texto={AJUDA_BANKING} /></span>
      </>}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-line-strong px-4 text-body text-fg-muted hover:bg-surface-2 hover:text-fg max-md:h-auto max-md:min-h-12 max-md:w-full max-md:justify-center max-md:py-2', ocupado && 'pointer-events-none opacity-50')}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Escolher a planilha de Banking…
            <input type="file" accept=".xlsx,.xls" className="sr-only" disabled={ocupado} onChange={e => { escolher(e.target.files?.[0] ?? null); e.target.value = '' }} />
          </label>
        </div>

        {estado.fase === 'lendo' && <Alert tone="neutral">Lendo a planilha…</Alert>}
        {estado.fase === 'erro' && <Alert tone="loss" title="Não deu">{estado.erro}</Alert>}

        {(estado.fase === 'lido' || estado.fase === 'gravando') && (
          <div className="space-y-3">
            <p className="text-dense text-fg-muted"><span className="font-semibold text-fg">{mesLongo(estado.leitura.mes)}</span> · {estado.nome} · {n0(estado.leitura.total.linhas)} linhas de {n0(estado.leitura.total.clientes)} clientes</p>
            <div className="tbl-wrap">
              <TabelaGrupos grupos={estado.leitura.grupos} total={estado.leitura.total} />
            </div>
            {estado.leitura.avisos.map((a, i) => <Alert key={i} tone="warn">{a}</Alert>)}
            {jaGravado && <Alert tone="neutral">O Banking de {mesLongo(estado.leitura.mes)} já está gravado ({r0(jaGravado.dados.total.liquida)} líquidos, de {jaGravado.dados.origem ?? 'outra planilha'}). Gravar de novo substitui.</Alert>}
            {estado.fase === 'lido' && estado.erro && <Alert tone="loss">{estado.erro}</Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={gravar} loading={estado.fase === 'gravando'}>Gravar o Banking de {mesLongo(estado.leitura.mes)}</Button>
              <Button variant="ghost" onClick={() => setEstado({ fase: 'vazio' })} disabled={estado.fase === 'gravando'}>Cancelar</Button>
              <span className="text-label text-fg-subtle">Dá para desfazer depois, em “Fora do giro e Banking gravados”.</span>
            </div>
          </div>
        )}

        {estado.fase === 'gravado' && (
          <Alert tone="gain" title={`Banking de ${mesLongo(estado.mes)} gravado`}>
            {r0(estado.liquida)} de comissão líquida{estado.substituidos ? ' (substituiu o que estava gravado para o mês)' : ''}. <Link href={`${base}/painel?mes=${estado.mes.slice(0, 7)}`} className="link inline-flex items-center gap-1">Ver no Painel <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
          </Alert>
        )}
      </Panel>

      {aplicados.length > 0 && (
        <Panel title={<>Fora do giro e Banking gravados <Dica texto={AJUDA_GRAVADOS} className="md:hidden" /></>} subtitle={<span className="max-md:hidden">{AJUDA_GRAVADOS}</span>}>
          {erroDesfazer && <Alert tone="loss" className="mb-3">{erroDesfazer}</Alert>}
          <div className="tbl-wrap">
            {/* no celular cada registro vira um item: o mês e o tipo em cima; a comissão líquida, a planilha e os
                outros valores embaixo; "Tirar" à direita, à vista (a tabela cortava o botão na borda) */}
            <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '5.5rem' } as CSSProperties}>
              <thead><tr><th>Mês</th><th>Tipo</th><th className="col-p2">Planilha</th><th className="num col-p3">Linhas</th><th className="num col-p2">Comissão do BTG</th><th className="num col-p2">Parte do escritório</th><th className="num">Comissão líquida</th><th className="col-p3">Gravado</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {aplicados.map(a => (
                  <tr key={a.id}>
                    <td className="font-medium cel-titulo">{mesLongo(a.dados.mes)}<span className="font-normal md:hidden"> · {FONTE_ROTULO[a.fonte]}</span></td>
                    <td className="muted whitespace-nowrap">{FONTE_ROTULO[a.fonte]}</td>
                    <td className="col-p2 max-w-[260px] truncate cel-sub" title={a.dados.origem ?? a.nome_arquivo}>{a.dados.origem ?? a.nome_arquivo}</td>
                    <td className="num col-p3 cel-sub" data-sufixo="linhas">{n0(a.dados.total.linhas)}</td>
                    <td className="num col-p2 cel-sub" data-rotulo="comissão do BTG">{r0(a.dados.total.comissao)}</td>
                    <td className="num col-p2 cel-sub" data-rotulo="parte do escritório">{r0(a.dados.total.parte)}</td>
                    <td className="num font-semibold cel-sub" data-rotulo="comissão líquida">{r0(a.dados.total.liquida)}</td>
                    <td className="muted col-p3 whitespace-nowrap cel-sub" data-rotulo="gravado">{fmtDataHoraPt(a.created_at)}{a.criado_por_nome ? ` · ${a.criado_por_nome}` : ''}</td>
                    <td className="text-right cel-acoes"><Button variant="ghost" size="xs" loading={desfazendo === a.id} onClick={() => desfazer(a)}><Undo2 className="h-3.5 w-3.5" aria-hidden />Tirar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  )
}

function TabelaGrupos({ grupos, total }: { grupos: GrupoBanking[]; total: TotaisBanking }) {
  return (
    <table className="tbl tbl-dense">
      <thead><tr><th>Produto</th><th className="num col-p2">Linhas</th><th className="num">Comissão do BTG</th><th className="num">Parte do escritório</th><th className="num col-p2">Imposto</th><th className="num">Comissão líquida</th></tr></thead>
      <tbody>
        {grupos.map(g => (
          <tr key={g.grupo}>
            <td className="font-medium">{g.grupo}</td>
            <td className="num col-p2">{n0(g.linhas)}</td>
            <td className="num">{r0(g.comissao)}</td>
            <td className="num">{r0(g.parte)} <span className="text-fg-subtle">({pct(g.pctEscritorio)})</span></td>
            <td className="num col-p2">{g.imposto ? <>{r0(g.imposto)} <span className="text-fg-subtle">({pct(g.impostoPct)})</span></> : TRACO}</td>
            <td className="num font-semibold">{r0(g.liquida)}</td>
          </tr>
        ))}
      </tbody>
      {grupos.length > 1 && (
        <tfoot>
          <tr className="total">
            <td>Total</td><td className="num col-p2">{n0(total.linhas)}</td><td className="num">{r0(total.comissao)}</td><td className="num">{r0(total.parte)}</td><td className="num col-p2">{r0(total.imposto)}</td><td className="num">{r0(total.liquida)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}
