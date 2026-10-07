// Lista compacta para a fronteira servidor → navegador. O React (RSC) serializa cada objeto
// com todas as chaves; com 1.500 clientes × 40 campos, as chaves são mais da metade do que
// trafega. Aqui as colunas vão uma vez e cada linha vira um array; o componente cliente
// expande de volta para objetos com `expandir` (barato: alguns milissegundos).
export type Compacto<T> = { colunas: (keyof T & string)[]; linhas: unknown[][] }

export function compactar<T, K extends keyof T & string>(rows: T[], colunas: readonly K[]): Compacto<Pick<T, K>> {
  return { colunas: [...colunas], linhas: rows.map(r => colunas.map(c => r[c])) }
}

export function expandir<T>(c: Compacto<T>): T[] {
  const n = c.colunas.length
  return c.linhas.map(l => {
    const o: Record<string, unknown> = {}
    for (let i = 0; i < n; i++) o[c.colunas[i]] = l[i]
    return o as T
  })
}
