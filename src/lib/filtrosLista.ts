// Filtros das listas (Clientes, Leads) guardados no endereço da página e num cookie da lista.
// Voltar da ficha (pela seta, pelo menu ou pelo botão voltar do navegador) reabre a lista como estava:
// - o cookie guarda os últimos filtros: quem chega sem filtros no endereço (seta da ficha, menu) os
//   recebe do servidor, já na primeira renderização;
// - o endereço também tem os filtros: o botão voltar do navegador restaura o endereço, e a tabela lê o
//   endereço ao montar (o Next reaproveita a página em cache, com as props antigas).
// Funções puras: valem no servidor (página) e no navegador (useFiltrosNaUrl).

export type ValoresFiltro = Record<string, string>

// 'n' = quantas linhas estão à mostra ("mostrar mais"), para o cliente aberto continuar na lista
export const CHAVES_FILTRO_CLIENTES = ['busca', 'status', 'situacao', 'responsavel', 'assessor', 'alerta', 'grupo', 'risco', 'nivel', 'ordem', 'n'] as const
export const CHAVES_FILTRO_LEADS = ['busca', 'mes', 'status', 'responsavel', 'origem', 'corretora', 'alerta', 'clientes', 'n'] as const

export const cookieFiltrosClientes = (corretora: string) => `zf_clientes_${corretora.toLowerCase()}`
export const COOKIE_FILTROS_LEADS = 'zf_leads'
export const PREFIXO_COOKIE_FILTROS = 'zf_'

// Querystring só com as chaves conhecidas, sem vazios e sem o que é igual ao padrão
export function serializarFiltros(valores: ValoresFiltro, padroes: ValoresFiltro): string {
  const p = new URLSearchParams()
  for (const k of Object.keys(padroes)) {
    const v = (valores[k] ?? '').trim()
    if (v && v !== padroes[k]) p.set(k, v)
  }
  return p.toString()
}

// Lê a querystring guardada (já decodificada: o cookies() do Next e lerCookie entregam assim),
// ficando só com as chaves conhecidas
export function lerFiltros(qs: string | null | undefined, chaves: readonly string[]): ValoresFiltro {
  const out: ValoresFiltro = {}
  if (!qs) return out
  const p = new URLSearchParams(qs)
  for (const k of chaves) {
    const v = p.get(k)
    if (v != null && v.trim() !== '') out[k] = v.slice(0, 200)
  }
  return out
}

// Valor de um cookie a partir do cabeçalho (document.cookie no navegador), decodificado uma vez,
// do mesmo jeito que o cookies() do Next entrega no servidor
export function lerCookie(cabecalho: string | null | undefined, nome: string): string | null {
  for (const parte of String(cabecalho ?? '').split(';')) {
    const i = parte.indexOf('=')
    if (i < 0 || parte.slice(0, i).trim() !== nome) continue
    const v = parte.slice(i + 1).trim()
    try { return decodeURIComponent(v) } catch { return v }
  }
  return null
}

// Filtros iniciais: os do endereço; se o endereço não tem nenhum filtro, os salvos no cookie
export function filtrosIniciais(daUrl: Record<string, string | undefined>, cookie: string | null | undefined, chaves: readonly string[]): ValoresFiltro {
  const naUrl: ValoresFiltro = {}
  for (const k of chaves) {
    const v = daUrl[k]
    if (typeof v === 'string' && v.trim() !== '') naUrl[k] = v.slice(0, 200)
  }
  return Object.keys(naUrl).length ? naUrl : lerFiltros(cookie, chaves)
}

// Linhas à mostra: de 100 em 100, entre 100 e 5.000
export function limiteDe(v: string | null | undefined, padrao = 100): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n <= padrao) return padrao
  return Math.min(5000, Math.ceil(n / 100) * 100)
}

// Valor de uma lista fixa de opções: fora da lista vira vazio (o filtro não pode ficar escondido)
export const opcaoValida = (v: string | undefined, opcoes: readonly string[]) => (v && opcoes.includes(v) ? v : '')

// Opções de um select tiradas dos dados, sem perder o valor escolhido que não está mais nos dados
export function comEscolhido(opcoes: string[], escolhido: string, especiais: readonly string[] = []): string[] {
  return escolhido && !especiais.includes(escolhido) && !opcoes.includes(escolhido) ? [...opcoes, escolhido] : opcoes
}
