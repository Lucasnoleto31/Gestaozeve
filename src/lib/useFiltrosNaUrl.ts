'use client'

// Filtros de uma lista no endereço e no cookie da lista (ver filtrosLista.ts).
import { useEffect } from 'react'
import { filtrosIniciais, lerCookie, serializarFiltros, type ValoresFiltro } from './filtrosLista'

const ESPERA_MS = 500
const MAX_AGE_S = 12 * 60 * 60   // 12 h: não sobrevive para o dia seguinte nem para outro usuário por muito tempo

// Valores iniciais no navegador, pela mesma regra da página no servidor (endereço; sem filtro no endereço,
// o cookie), lendo o endereço real: no botão voltar o Next reaproveita a página em cache com as props
// antigas, mas o endereço é o restaurado. No servidor devolve null e vale o que a página mandou.
export function filtrosNoNavegador(nomeCookie: string, chaves: readonly string[]): ValoresFiltro | null {
  if (typeof window === 'undefined') return null
  try {
    const daUrl: Record<string, string> = {}
    for (const [k, v] of new URLSearchParams(window.location.search)) daUrl[k] = v
    return filtrosIniciais(daUrl, lerCookie(document.cookie, nomeCookie), chaves)
  } catch {
    return null
  }
}

// Grava os filtros:
// - no cookie, na hora (a seta da ficha e o menu chegam sem filtro no endereço e o servidor usa o cookie);
// - no endereço, sem passar pelo router do Next (o estado interno do histórico vai junto, então não há
//   navegação nem recarga, e uma navegação em andamento não é cancelada), um instante depois da última
//   mudança (o Safari bloqueia trocas demais em poucos segundos) e também no começo de qualquer clique,
//   antes de um link navegar: a entrada do histórico da lista sai com os filtros certos.
export function useFiltrosNaUrl(nomeCookie: string, valores: ValoresFiltro, padroes: ValoresFiltro) {
  const qs = serializarFiltros(valores, padroes)
  const chaves = Object.keys(padroes).join(',')

  useEffect(() => {
    try { document.cookie = `${nomeCookie}=${encodeURIComponent(qs)}; path=/; max-age=${MAX_AGE_S}; samesite=lax` } catch { /* sem cookie: fica o endereço */ }
  }, [nomeCookie, qs])

  useEffect(() => {
    const caminho = window.location.pathname
    const gravar = () => {
      try {
        if (window.location.pathname !== caminho) return   // já saiu da lista
        const url = new URL(window.location.href)
        for (const k of chaves.split(',')) url.searchParams.delete(k)
        for (const [k, v] of new URLSearchParams(qs)) url.searchParams.set(k, v)
        const novo = `${url.pathname}${url.search}${url.hash}`
        if (novo === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
        window.history.replaceState({ ...(window.history.state ?? {}) }, '', novo)
      } catch { /* endereço fica como está */ }
    }
    const t = setTimeout(gravar, ESPERA_MS)
    document.addEventListener('click', gravar, true)
    return () => { clearTimeout(t); document.removeEventListener('click', gravar, true) }
  }, [qs, chaves])
}

// Rola até a linha do último registro aberto da lista (guardado no clique do link) ao voltar para ela
const chaveUltimo = (lista: string) => `zf_ultimo:${lista}`
export function lembrarAberto(lista: string, id: string) {
  try { sessionStorage.setItem(chaveUltimo(lista), id) } catch { /* sem sessão: não rola */ }
}
export function useRolarAteAberto(lista: string) {
  useEffect(() => {
    let id: string | null = null
    try { id = sessionStorage.getItem(chaveUltimo(lista)); sessionStorage.removeItem(chaveUltimo(lista)) } catch { /* nada */ }
    if (!id) return
    const t = setTimeout(() => {
      const linha = document.querySelector(`[data-linha="${CSS.escape(id)}"]`)
      if (linha instanceof HTMLElement) linha.scrollIntoView({ block: 'center' })
    }, 50)
    return () => clearTimeout(t)
  }, [lista])
}
