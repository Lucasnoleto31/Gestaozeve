// O que as abas do Funil compartilham.
import type { FunilResultadoRow, FunilSafraBase } from '@/lib/gestao/tipos'

// Mesma regra da comissão (S41): voltar a operar depois de N meses parado é reativação
export const MESES_INATIVO = 4
export const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : null)

export const RESULTADO_VAZIO: FunilResultadoRow = {
  mes_ref: '', ganhos: 0, perdidos: 0, contas_novas: 0, novos_operaram: 0, ativados: 0, reativados: 0, carteira_operou: 0,
  receita_total: 0, receita_novos: 0, receita_ativados: 0, receita_reativados: 0, receita_carteira: 0,
  lotes_total: 0, lotes_novos: 0, lotes_ativados: 0, lotes_reativados: 0, lotes_carteira: 0,
}

export const CHAVES_SAFRA: (keyof FunilSafraBase)[] = [
  'recebidos', 'contatados', 'perdidos', 'ganhos', 'em_aberto', 'ja_clientes', 'viraram_clientes', 'ativados', 'em_processamento', 'recusaram',
  'com_giro', 'lotes', 'receita', 'contatos', 'contatos_ganhos', 'ganhos_contatados', 'em_contato', 'perdidos_funil', 'contas_abertas', 'contas_em_abertura',
]
export const somaSafra = (linhas: FunilSafraBase[]): FunilSafraBase =>
  Object.fromEntries(CHAVES_SAFRA.map(k => [k, linhas.reduce((acc, x) => acc + x[k], 0)])) as FunilSafraBase

export type PeriodoFunil = 'mes' | '12m'
