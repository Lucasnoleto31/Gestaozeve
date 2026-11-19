// O que as abas do Funil compartilham.
import type { CSSProperties } from 'react'
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

// ─── Celular (DESIGN.md §8): tudo aqui só age abaixo de 768 px ───────────────────────────────────────
export const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// Largura reservada para o número à direita na lista (tbl-lista): o padrão da base (6rem) corta
// valores como "R$ 123.456,78"
export const LISTA_LARGA = { '--lista-direita': '7.75rem' } as CSSProperties

// Célula que entra sempre na linha de apoio da lista ("98 leads · 26 tombaram"). O peso normal da linha de
// apoio (mesmo em coluna que no computador é negrito, e na linha de total) vem da base.
export const celApoio = (temDado = true) => (temDado ? 'cel-sub' : undefined)

// Célula que só entra na linha de apoio da lista quando "Mais números" está ligado (MaisNumeros.tsx):
// são as colunas que o computador mostra e que no celular ficariam sem lugar. Sem dado, a célula fica
// sem papel (some), porque a classe `vazio` da base não vence a regra que a mostra.
// Cuidado com a ordem: a primeira célula de apoio da linha tem de ser uma que aparece sempre (ou então
// todas as de apoio da linha são deste tipo), senão a seguinte ganha um "·" na frente.
export const celMais = (temDado: boolean) => (temDado ? 'cel-sub max-md:hidden! max-md:group-data-[numeros=true]/numeros:inline!' : undefined)
