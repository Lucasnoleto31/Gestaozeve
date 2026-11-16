// Tela Gráficos (redesenho de nov/26): a operação na ordem em que ela acontece, do lead à receita.
// Lucas: "coloque gráficos que façam sentido da nossa operação, está tudo uma bagunça". Cada bloco
// (Captação, Ativação, Lotes, Receita, Retenção, Time, Plataformas) tem um ou dois gráficos, e o título de
// cada um é a pergunta que ele responde. Aqui ficam as contas, que só agregam o que já está no banco
// (funções puras, testes em graficosTela.test.ts); quem lê o banco é a página.
import { inicioSemana, somarDias, somarMeses } from './meses'

export const PERIODOS_GRAFICOS = [3, 6, 12] as const
export type PeriodoGraficos = (typeof PERIODOS_GRAFICOS)[number]
export const PERIODO_PADRAO: PeriodoGraficos = 6
export const periodoDe = (v: string | undefined): PeriodoGraficos => PERIODOS_GRAFICOS.find(p => String(p) === v) ?? PERIODO_PADRAO

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// Segundas-feiras das semanas que cobrem [inicio, fim]
export function semanasDe(inicio: string, fim: string): string[] {
  const semanas: string[] = []
  for (let s = inicioSemana(inicio); s <= fim; s = somarDias(s, 7)) semanas.push(s)
  return semanas
}

// Soma uma série por dia em semanas (segunda a domingo). O rótulo é o dia/mês da segunda-feira.
export function somarPorSemana<T, K extends string>(linhas: T[], dia: (x: T) => string, semanas: string[], campos: Record<K, (x: T) => number>): (Record<K, number> & { label: string; inicio: string })[] {
  const chaves = Object.keys(campos) as K[]
  const indice = new Map(semanas.map((s, i) => [s, i]))
  const somas = semanas.map(() => Object.fromEntries(chaves.map(k => [k, 0])) as Record<K, number>)
  for (const x of linhas) {
    const i = indice.get(inicioSemana(dia(x)))
    if (i == null) continue
    for (const k of chaves) somas[i][k] += campos[k](x)
  }
  return semanas.map((s, i) => ({ ...somas[i], label: ddmm(s), inicio: s }))
}

// Ativação: de quem migrou em cada mês, quantos já operaram (até hoje) e quantos ainda não
type ClienteDaSafra = { status: string; situacao: string; data_migracao: string | null }
export function ativacaoPorMes(clientes: ClienteDaSafra[], meses: string[]): { mes: string; migraram: number; operaram: number; aindaNao: number }[] {
  const por = new Map(meses.map(m => [m.slice(0, 7), { mes: m, migraram: 0, operaram: 0, aindaNao: 0 }]))
  for (const c of clientes) {
    if (c.status !== 'Migrado' || !c.data_migracao) continue
    const linha = por.get(c.data_migracao.slice(0, 7))
    if (!linha) continue
    linha.migraram++
    if (c.situacao === 'Nunca girou') linha.aindaNao++
    else linha.operaram++
  }
  return [...por.values()]
}

// Retenção: em cada mês, quem começou ou voltou a operar (operou no mês e não no anterior) e quem parou
// (operou no anterior e não no mês). `matriz` precisa trazer também o mês anterior ao primeiro de `meses`.
type ClienteMes = { cliente_id: string; mes_ref: string; lotes: number }
export function fluxoDaCarteira(matriz: ClienteMes[], meses: string[]): { mes: string; comecaram: number; pararam: number; operaram: number }[] {
  const quemOperou = new Map<string, Set<string>>()
  for (const x of matriz) {
    if (x.lotes <= 0) continue
    const k = x.mes_ref.slice(0, 7)
    if (!quemOperou.has(k)) quemOperou.set(k, new Set())
    quemOperou.get(k)!.add(x.cliente_id)
  }
  return meses.map(m => {
    const agora = quemOperou.get(m.slice(0, 7)) ?? new Set<string>()
    const antes = quemOperou.get(somarMeses(m, -1).slice(0, 7)) ?? new Set<string>()
    let comecaram = 0, pararam = 0
    for (const id of agora) if (!antes.has(id)) comecaram++
    for (const id of antes) if (!agora.has(id)) pararam++
    return { mes: m, comecaram, pararam, operaram: agora.size }
  })
}

// Retenção: fatia dos lotes do mês nos N maiores clientes (0 a 100; null sem lotes no mês)
export function concentracaoPorMes(matriz: ClienteMes[], meses: string[], n = 5): { mes: string; pct: number | null }[] {
  const porMes = new Map<string, number[]>()
  for (const x of matriz) {
    if (x.lotes <= 0) continue
    const k = x.mes_ref.slice(0, 7)
    if (!porMes.has(k)) porMes.set(k, [])
    porMes.get(k)!.push(x.lotes)
  }
  return meses.map(m => {
    const lotes = (porMes.get(m.slice(0, 7)) ?? []).sort((a, b) => b - a)
    const total = lotes.reduce((s, v) => s + v, 0)
    return { mes: m, pct: total > 0 ? (lotes.slice(0, n).reduce((s, v) => s + v, 0) / total) * 100 : null }
  })
}

// Plataformas: o mesmo nome escrito de dois jeitos ("BTG DESKTOP" e "BTG_DESKTOP") vira uma fatia só
export const nomeDaPlataforma = (nome: string) => nome.toUpperCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'NÃO INFORMADA'
export function juntarPlataformas<T extends { plataforma: string; lotes: number }>(mix: T[]): { nome: string; valor: number }[] {
  const por = new Map<string, number>()
  for (const m of mix) por.set(nomeDaPlataforma(m.plataforma), (por.get(nomeDaPlataforma(m.plataforma)) ?? 0) + m.lotes)
  return [...por.entries()].map(([nome, valor]) => ({ nome, valor })).filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor)
}

const num = (v: number) => Math.round(v).toLocaleString('pt-BR')
const pct0 = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)} %` : null)

// A frase do topo: a operação do período em três passos (captação, ativação, receita)
export function fraseDosGraficos(d: { periodo: number; leads: number; ganhos: number; migraram: number; operaram: number; receita: string; porLote: string | null }): string {
  const janela = d.periodo === 1 ? 'No último mês' : `Nos últimos ${d.periodo} meses`
  const taxa = pct0(d.ganhos, d.leads)
  const captacao = d.leads > 0
    ? `${janela} ${d.leads === 1 ? 'entrou 1 lead' : `entraram ${num(d.leads)} leads`} e ${d.ganhos === 1 ? '1 foi ganho' : `${num(d.ganhos)} foram ganhos`}${taxa ? ` (${taxa})` : ''}.`
    : `${janela} não entrou nenhum lead.`
  const ativacao = d.migraram > 0
    ? ` ${d.migraram === 1 ? 'Migrou 1 conta' : `Migraram ${num(d.migraram)} contas`} e ${pct0(d.operaram, d.migraram)} delas já ${d.migraram === 1 ? 'operou' : 'operaram'}.`
    : ' Nenhuma conta migrou no período.'
  const receita = ` A receita somou ${d.receita}${d.porLote ? `, ${d.porLote} por lote` : ''}.`
  return `${captacao}${ativacao}${receita}`
}
