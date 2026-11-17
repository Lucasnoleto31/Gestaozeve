// Origem / parceiro escolhido em lista (Lucas, 17/11/2026: "quando for colocar o parceiro coloque para
// selecionarmos o Parceiro, por exemplo Atual Capital, Fabio Ferron, ao invés de digitar"). O campo continua
// um só e em texto (leads.origem e cliente_corretora.parceiro). A lista tem dois grupos: os parceiros, que
// são quem recebe do escritório (comissionados e com participação na receita), e as origens que já estão
// em uso (hero, Instagram…). Um nome digitado diferente do cadastro deixava o cliente fora da conta do
// parceiro; pela lista o nome sai sempre igual. Tudo casa sem acento nem caixa.
import { normTexto } from '@/lib/texto'

export type OpcoesOrigem = { parceiros: string[]; origens: string[] }

export const OPCOES_ORIGEM_VAZIAS: OpcoesOrigem = { parceiros: [], origens: [] }

// parceiros = nomes de quem recebe; emUso = o que está escrito hoje nos leads e nas fichas (um item por
// registro, para a origem mais usada vir primeiro e valer a grafia mais comum de cada uma)
export function opcoesDeOrigem(parceiros: string[], emUso: (string | null | undefined)[]): OpcoesOrigem {
  const nomes = new Map<string, string>()
  for (const p of parceiros) {
    const n = p.trim()
    if (n && !nomes.has(normTexto(n))) nomes.set(normTexto(n), n)
  }
  const grafias = new Map<string, Map<string, number>>()
  for (const v of emUso) {
    const n = (v ?? '').trim()
    if (!n) continue
    const k = normTexto(n)
    if (nomes.has(k)) continue
    let g = grafias.get(k)
    if (!g) { g = new Map(); grafias.set(k, g) }
    g.set(n, (g.get(n) ?? 0) + 1)
  }
  const origens = [...grafias.values()]
    .map(g => ({
      nome: [...g.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0],
      total: [...g.values()].reduce((s, n) => s + n, 0),
    }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
    .map(o => o.nome)
  return { parceiros: [...nomes.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })), origens }
}

export type OrigemNaLista = { grupo: 'vazio' | 'parceiro' | 'origem' | 'fora'; valor: string }

// Onde um valor gravado está na lista, já com a grafia da lista ("atual capital" → "Atual Capital").
// 'fora' = texto escrito antes da lista que não é parceiro nem origem em uso: continua valendo.
export function origemNaLista(valor: string | null | undefined, op: OpcoesOrigem): OrigemNaLista {
  const v = (valor ?? '').trim()
  if (!v) return { grupo: 'vazio', valor: '' }
  const k = normTexto(v)
  const p = op.parceiros.find(x => normTexto(x) === k)
  if (p) return { grupo: 'parceiro', valor: p }
  const o = op.origens.find(x => normTexto(x) === k)
  if (o) return { grupo: 'origem', valor: o }
  return { grupo: 'fora', valor: v }
}

// ── Motivo da perda em lista ────────────────────────────────────────────────
// Os mesmos motivos estavam escritos de dezenas de jeitos ("mesa proprietária" de pelo menos sete). A lista
// cobre os que mais aparecem; "Outro" abre o texto. O campo continua em texto (leads.motivo_perda) e o que
// já está gravado não muda.
export const MOTIVOS_PERDA = ['Sem resposta', 'Mesa proprietária', 'Sem interesse', 'Número incorreto', 'Bloqueou no WhatsApp', 'Parou de operar'] as const
export const OUTRO_MOTIVO = 'Outro'

// O motivo gravado, visto pela lista: um dos motivos (com a grafia da lista) ou "Outro" com o texto
export function motivoNaLista(valor: string | null | undefined): { escolha: string; texto: string } {
  const v = (valor ?? '').trim()
  if (!v) return { escolha: '', texto: '' }
  const m = MOTIVOS_PERDA.find(x => normTexto(x) === normTexto(v))
  return m ? { escolha: m, texto: '' } : { escolha: OUTRO_MOTIVO, texto: v }
}
