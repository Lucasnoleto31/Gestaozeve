// Extrato mensal do parceiro (S48): totais, matriz da planilha e nome do arquivo.
// Sem dependência de React nem de servidor (a tela e a planilha usam o mesmo cálculo).
import type { ExtratoParceiroRow } from './tipos'
import { mesLongo } from './meses'
import { CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'

export type TotaisExtrato = { contas: number; giraram: number; lotes_mes: number; zerados_mes: number; receita_mes: number; lotes_12m: number; receita_12m: number }

export function totaisExtrato(linhas: ExtratoParceiroRow[]): TotaisExtrato {
  return linhas.reduce<TotaisExtrato>((t, l) => ({
    contas: t.contas + 1, giraram: t.giraram + (l.lotes_mes > 0 ? 1 : 0),
    lotes_mes: t.lotes_mes + l.lotes_mes, zerados_mes: t.zerados_mes + l.zerados_mes, receita_mes: t.receita_mes + l.receita_mes,
    lotes_12m: t.lotes_12m + l.lotes_12m, receita_12m: t.receita_12m + l.receita_12m,
  }), { contas: 0, giraram: 0, lotes_mes: 0, zerados_mes: 0, receita_mes: 0, lotes_12m: 0, receita_12m: 0 })
}

// 'Aikon' → 'aikon'; 'ZEVE 18 · BTG' → 'zeve-18-btg'
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// extrato-aikon-2026-10.xlsx (com a corretora quando o extrato é de uma só)
export const nomeArquivoExtrato = (parceiro: string, mesRef: string, corretora?: string | null) =>
  `extrato-${slug(parceiro)}${corretora ? `-${slug(corretora)}` : ''}-${mesRef.slice(0, 7)}.xlsx`

export const rotuloCorretora = (c: string) => (isCorretora(c) ? CORRETORA_LABEL[c] : c)
const dataPt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const round2 = (v: number) => Math.round(v * 100) / 100

export type Celula = string | number | null
// Matriz da planilha: cabeçalho, uma linha por conta e a linha de total. Receita só quando comReceita.
export function linhasPlanilha(linhas: ExtratoParceiroRow[], comReceita: boolean): Celula[][] {
  const rec = <T,>(v: T): T[] => (comReceita ? [v] : [])
  const cab: Celula[] = ['Cliente', 'Corretora', 'Conta', 'Situação', 'Abertura', 'Lotes no mês', 'Zerados no mês', ...rec('Receita bruta no mês (R$)'), 'Lotes em 12 meses', ...rec('Receita bruta em 12 meses (R$)'), 'Último mês com giro']
  const corpo = linhas.map<Celula[]>(l => [
    l.nome, rotuloCorretora(l.corretora), l.conta, l.status, l.data_abertura ? dataPt(l.data_abertura) : null,
    l.lotes_mes, l.zerados_mes, ...rec(round2(l.receita_mes)), l.lotes_12m, ...rec(round2(l.receita_12m)), l.ultimo_mes_giro ? mesLongo(l.ultimo_mes_giro) : null,
  ])
  const t = totaisExtrato(linhas)
  const total: Celula[] = [`Total · ${t.contas} contas · ${t.giraram} giraram no mês`, null, null, null, null, t.lotes_mes, t.zerados_mes, ...rec(round2(t.receita_mes)), t.lotes_12m, ...rec(round2(t.receita_12m)), null]
  return [cab, ...corpo, total]
}
