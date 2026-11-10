// O que as abas da tela Comissões compartilham: rótulos, a linha mensal e o endereço com os filtros.
import type { BadgeVariant } from '@/components/ui/Badge'
import type { ComissaoContaMes, ComissaoItem, ComissaoMensalRow, ComissaoPagamento } from '@/lib/gestao/tipos'
import { CORRETORA_LABEL, isCorretora, type Corretora } from '@/lib/corretoras'
import { parseMes } from '@/lib/gestao/meses'

export const SITUACAO: Record<string, BadgeVariant> = {
  'Ativado': 'gain', 'Reativado': 'gain', 'Aberto, no prazo': 'accent', 'Prazo vencido': 'warn', 'Operou fora do prazo': 'warn',
  'Conta anterior ao lead': 'neutral', 'Em processamento': 'neutral', 'Recusou': 'loss',
}
export const TIPO: Record<ComissaoContaMes['tipo'], { label: string; variant: BadgeVariant }> = {
  abertura: { label: 'Abertura', variant: 'accent' },
  ativacao: { label: 'Ativação', variant: 'gain' },
  reativacao: { label: 'Reativação', variant: 'warn' },
}
export const corretoraNome = (c: string) => (isCorretora(c) ? CORRETORA_LABEL[c] : c)
export const round2 = (v: number) => Math.round(v * 100) / 100
const ddmmaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

export function origemTexto(origem: ComissaoItem['origem'], dataLead: string | null, assessor: string | null): string {
  if (origem === 'lead') return dataLead ? `lead em ${ddmmaa(dataLead)}` : 'lead'
  if (origem === 'assessor') return `assessor ${assessor ?? ''}`.trim()
  if (origem === 'responsavel') return 'responsável interno' + (assessor ? ` · ${assessor}` : '')
  if (origem === 'campanha') return 'campanha de ativação'
  return 'parceiro na ficha'
}

export type LinhaMes = { mes: string; aberturas: number; ativacoes: number; reativacoes: number; contas: number; receita: number; carteira: number; comissao: number; pago: number }
export const linhaVazia = (mes: string): LinhaMes => ({ mes, aberturas: 0, ativacoes: 0, reativacoes: 0, contas: 0, receita: 0, carteira: 0, comissao: 0, pago: 0 })

// Soma o mensal (por corretora) e os pagamentos em uma linha por mês da janela
export function linhasPorMes(meses: string[], mensal: ComissaoMensalRow[], pagamentos: ComissaoPagamento[]): LinhaMes[] {
  const porMes = new Map<string, LinhaMes>()
  const linha = (m: string) => { let x = porMes.get(m); if (!x) { x = linhaVazia(m); porMes.set(m, x) } return x }
  for (const r of mensal) {
    const x = linha(r.mes_ref)
    x.aberturas += r.aberturas; x.ativacoes += r.ativacoes; x.reativacoes += r.reativacoes; x.contas += r.contas_mes
    x.receita += r.receita_contas; x.carteira += r.receita_carteira; x.comissao += r.valor_abertura + r.valor_ativacao
  }
  for (const p of pagamentos) { const m = parseMes(p.mes_ref); if (m) linha(m).pago += p.valor }
  return meses.map(m => linha(m))
}
export const somaLinhas = (linhas: LinhaMes[]): LinhaMes => linhas.reduce((t, x) => ({
  mes: '', aberturas: t.aberturas + x.aberturas, ativacoes: t.ativacoes + x.ativacoes, reativacoes: t.reativacoes + x.reativacoes, contas: t.contas + x.contas,
  receita: t.receita + x.receita, carteira: t.carteira + x.carteira, comissao: t.comissao + x.comissao, pago: t.pago + x.pago,
}), linhaVazia(''))

// Pagamentos que valem para o filtro de corretora (pagamento "Geral" vale em todas)
export const pagamentosDoFiltro = (pagamentos: ComissaoPagamento[], corretora: Corretora | null) =>
  (corretora ? pagamentos.filter(p => !p.corretora || p.corretora === corretora) : pagamentos)

// Endereço da tela com os filtros (parceiro vazio = visão geral; aba vazia = a padrão)
export function hrefComissoes(f: { parceiro?: string | null; corretora?: string | null; mes?: string | null; aba?: string | null }): string {
  const p = new URLSearchParams()
  if (f.parceiro) p.set('parceiro', f.parceiro)
  if (f.corretora) p.set('corretora', f.corretora)
  if (f.mes) p.set('mes', f.mes.slice(0, 7))
  if (f.aba) p.set('aba', f.aba)
  const qs = p.toString()
  return qs ? `/comissoes?${qs}` : '/comissoes'
}

export type FiltroAba = { parceiro: string; corretora: Corretora | null; mesRef: string }
