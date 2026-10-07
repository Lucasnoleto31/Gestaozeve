import { somarDias } from './meses'
// Economia do BTG, na ordem do fechamento mensal que o BTG manda (planilha "Artur Fonseca"):
//   receita (lotes × tarifa + zeragem)
//   → receita bruta BTG: o preço cobrado do cliente embute 9,65 % de impostos (÷ (1 − 9,65 %))
//   → (–) impostos que o BTG desconta (6,65 %) = receita líquida BTG
//   → comissão BTG: faixas progressivas (75 % até 100 mil…) sobre a líquida
//   → (–) Delta 30 % = comissão do escritório
//   → (–) imposto do escritório 16,5 % = comissão líquida → divisão entre os sócios
// Metas do programa ATP Turbo Receita sobre a base escolhida (atp_base).
// Só funções puras, sobre os parâmetros da corretora (testes em btg.test.ts).
import type { Parametro } from './tipos'

export type FaixaRepasse = { de: number; pct: number }        // a partir de R$ `de`, repasse de `pct` %
export type Participacao = { nome: string; pct: number }
export type MetaAtp = { prazoMeses: number; comissao: number; premio: number; observacao: string }

export type BaseAtp = 'receita' | 'bruta' | 'liquida' | 'comissao'
export const BASES_ATP: { base: BaseAtp; label: string }[] = [
  { base: 'receita', label: 'receita (lotes × tarifa)' },
  { base: 'bruta', label: 'receita bruta do BTG' },
  { base: 'liquida', label: 'receita líquida do BTG' },
  { base: 'comissao', label: 'comissão paga pelo BTG' },
]
export type ConfigBtg = {
  modelo: 'PONTOS' | 'ATP'
  faixas: FaixaRepasse[]
  impostosEmbutidosPct: number   // impostos embutidos no preço cobrado do cliente (9,65 %)
  impostoBtgPct: number          // o que o BTG desconta da receita bruta (6,65 %)
  deltaPct: number               // Delta, sobre a comissão
  impostoPct: number             // imposto do escritório, sobre a comissão depois da Delta
  participacoes: Participacao[]
  atpBase: BaseAtp
  atpAssinatura: string | null   // 'YYYY-MM-DD'
  atpMetas: MetaAtp[]
}

// '16,6' / '16.6' / 'R$ 100.000' → número (null quando não é número)
export function numeroParam(s: string | null | undefined): number | null {
  if (s == null) return null
  let v = s.trim().replace(/\s|R\$|%/g, '')
  if (v === '') return null
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.')          // 1.234,5 → 1234.5
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '')    // 100.000 → 100000
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null
  return Number(v)
}

// '0:75;100000:80;250000:85' → faixas ordenadas (vazio quando a configuração é inválida)
export function lerFaixas(s: string | null | undefined): FaixaRepasse[] {
  if (!s || !s.trim()) return []
  const out: FaixaRepasse[] = []
  for (const parte of s.split(';')) {
    if (!parte.trim()) continue
    const [de, pct, resto] = parte.split(':')
    const d = numeroParam(de), p = numeroParam(pct)
    if (d == null || p == null || resto !== undefined || d < 0 || p < 0 || p > 100) return []
    out.push({ de: d, pct: p })
  }
  return out.sort((a, b) => a.de - b.de)
}

// 'Lucas:50;Artur:50' → participações
export function lerParticipacoes(s: string | null | undefined): Participacao[] {
  if (!s || !s.trim()) return []
  const out: Participacao[] = []
  for (const parte of s.split(';')) {
    if (!parte.trim()) continue
    const i = parte.lastIndexOf(':')
    if (i <= 0) return []
    const nome = parte.slice(0, i).trim(), pct = numeroParam(parte.slice(i + 1))
    if (!nome || pct == null || pct < 0 || pct > 100) return []
    out.push({ nome, pct })
  }
  return out
}

// '18:50000:50000:Upfront com devolução;9:110000:50000;…' → metas (prazo em meses, comissão, prêmio[, observação])
export function lerMetas(s: string | null | undefined): MetaAtp[] {
  if (!s || !s.trim()) return []
  const out: MetaAtp[] = []
  for (const parte of s.split(';')) {
    if (!parte.trim()) continue
    const [prazo, comissao, premio, ...obs] = parte.split(':')
    const p = numeroParam(prazo), c = numeroParam(comissao), v = numeroParam(premio)
    if (p == null || c == null || v == null || p <= 0 || c < 0 || v < 0) return []
    out.push({ prazoMeses: p, comissao: c, premio: v, observacao: obs.join(':').trim() })
  }
  return out
}

export function configBtg(parametros: Parametro[]): ConfigBtg {
  const v = (chave: string) => parametros.find(p => p.chave === chave)?.valor?.trim() ?? ''
  const assinatura = v('atp_assinatura')
  const base = v('atp_base').toLowerCase()
  return {
    modelo: v('modelo_incentivo').toUpperCase() === 'ATP' ? 'ATP' : 'PONTOS',
    faixas: lerFaixas(v('repasse_faixas')),
    impostosEmbutidosPct: numeroParam(v('impostos_embutidos_pct')) ?? 0,
    impostoBtgPct: numeroParam(v('imposto_btg_pct')) ?? 0,
    deltaPct: numeroParam(v('delta_pct')) ?? 0,
    impostoPct: numeroParam(v('imposto_pct')) ?? 0,
    participacoes: lerParticipacoes(v('participacoes')),
    atpBase: BASES_ATP.some(b => b.base === base) ? (base as BaseAtp) : 'receita',
    atpAssinatura: /^\d{4}-\d{2}-\d{2}$/.test(assinatura) ? assinatura : null,
    atpMetas: lerMetas(v('atp_metas')),
  }
}

// Repasse progressivo: cada % vale só sobre a parcela do bruto dentro da faixa
export function repasseProgressivo(bruto: number, faixas: FaixaRepasse[]): { valor: number; pctEfetivo: number } {
  if (bruto <= 0 || faixas.length === 0) return { valor: 0, pctEfetivo: 0 }
  let valor = 0
  for (let i = 0; i < faixas.length; i++) {
    const de = faixas[i].de
    const ate = faixas[i + 1]?.de ?? Infinity
    const parcela = Math.max(0, Math.min(bruto, ate) - de)
    valor += (parcela * faixas[i].pct) / 100
  }
  return { valor, pctEfetivo: (valor / bruto) * 100 }
}

export type Repasse = {
  receita: number             // nossa receita: lotes × tarifa + zeragem
  bruta: number               // receita bruta do BTG (impostos embutidos no preço)
  impostoBtg: number          // impostos que o BTG desconta
  liquida: number             // receita líquida do BTG
  pctEfetivo: number          // % de comissão efetivo sobre a líquida
  comissao: number            // comissão paga pelo BTG (repasse)
  retencao: number            // o que o BTG retém da líquida
  delta: number               // parte da Delta
  comissaoEscritorio: number  // comissão depois da Delta
  imposto: number             // imposto do escritório
  liquido: number             // comissão líquida
  partes: { nome: string; valor: number }[]
}

export type ConfigRepasse = Pick<ConfigBtg, 'faixas' | 'impostosEmbutidosPct' | 'impostoBtgPct' | 'deltaPct' | 'impostoPct' | 'participacoes'>

// Receita → bruta BTG → (–) impostos BTG → líquida → comissão (faixas) → (–) Delta → (–) imposto → líquida → sócios
export function calcularRepasse(receita: number, cfg: ConfigRepasse): Repasse {
  const bruta = cfg.impostosEmbutidosPct > 0 && cfg.impostosEmbutidosPct < 100 ? receita / (1 - cfg.impostosEmbutidosPct / 100) : receita
  const impostoBtg = (bruta * cfg.impostoBtgPct) / 100
  const liquida = bruta - impostoBtg
  const { valor: comissao, pctEfetivo } = repasseProgressivo(liquida, cfg.faixas)
  const delta = (comissao * cfg.deltaPct) / 100
  const comissaoEscritorio = comissao - delta
  const imposto = (comissaoEscritorio * cfg.impostoPct) / 100
  const liquido = comissaoEscritorio - imposto
  return {
    receita, bruta, impostoBtg, liquida, pctEfetivo, comissao, retencao: liquida - comissao, delta, comissaoEscritorio, imposto, liquido,
    partes: cfg.participacoes.map(p => ({ nome: p.nome, valor: (liquido * p.pct) / 100 })),
  }
}

// Valor de um mês na base que as metas do ATP usam
export function baseAtp(receita: number, cfg: ConfigRepasse & Pick<ConfigBtg, 'atpBase'>): number {
  if (cfg.atpBase === 'receita') return receita
  const r = calcularRepasse(receita, cfg)
  return cfg.atpBase === 'bruta' ? r.bruta : cfg.atpBase === 'liquida' ? r.liquida : r.comissao
}

// Soma meses a uma data ISO mantendo o dia (31/01 + 1 mês = 28/02)
export function somarMesesData(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12), nm = total % 12
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

const dias = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000)
export const mesesEntre = (a: string, b: string) => dias(a, b) / 30.4375

export type MetaAvaliada = MetaAtp & {
  indice: number
  prazoFim: string             // data-limite ('YYYY-MM-DD')
  acumulado: number            // comissão acumulada que conta para a meta
  atingidaEm: string | null    // mês ('YYYY-MM-01') em que bateu a comissão dentro do prazo
  status: 'atingida' | 'em andamento' | 'vencida'
  faltam: number
  mesesRestantes: number
  ritmoMensal: number          // R$/mês necessários para bater a meta no prazo
}

// Comissão acumulada desde a assinatura (série mensal de receita bruta) × metas do programa
export function avaliarMetas(metas: MetaAtp[], assinatura: string, serie: { mes_ref: string; receita: number }[], hoje: string): MetaAvaliada[] {
  const ordenada = [...serie].filter(m => m.mes_ref >= assinatura.slice(0, 7) + '-01').sort((a, b) => a.mes_ref.localeCompare(b.mes_ref))
  const acumulados: { mes_ref: string; acumulado: number }[] = []
  let soma = 0
  for (const m of ordenada) { soma += m.receita; acumulados.push({ mes_ref: m.mes_ref, acumulado: soma }) }
  const totalHoje = soma
  return metas.map((meta, i) => {
    const prazoFim = somarMesesData(assinatura, meta.prazoMeses)
    const mesLimite = prazoFim.slice(0, 7) + '-01'
    const batida = acumulados.find(a => a.mes_ref <= mesLimite && a.acumulado >= meta.comissao)
    const vencida = !batida && hoje > prazoFim
    const acumulado = vencida ? (acumulados.filter(a => a.mes_ref <= mesLimite).at(-1)?.acumulado ?? 0) : totalHoje
    const faltam = batida ? 0 : Math.max(0, meta.comissao - acumulado)
    const mesesRestantes = Math.max(0, mesesEntre(hoje, prazoFim))
    return {
      ...meta, indice: i + 1, prazoFim, acumulado, atingidaEm: batida?.mes_ref ?? null,
      status: batida ? 'atingida' : vencida ? 'vencida' : 'em andamento',
      faltam, mesesRestantes,
      ritmoMensal: !batida && !vencida && faltam > 0 ? faltam / Math.max(mesesRestantes, 0.25) : 0,
    }
  })
}

// ── Previsão das metas (ATP) ──────────────────────────────────────────────────
// Dias úteis (segunda a sexta) entre duas datas ISO, inclusive. Feriados não entram.
export function diasUteis(inicio: string, fim: string): number {
  if (!inicio || !fim || fim < inicio) return 0
  let n = 0
  const d = new Date(Date.UTC(+inicio.slice(0, 4), +inicio.slice(5, 7) - 1, +inicio.slice(8, 10)))
  const f = Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7) - 1, +fim.slice(8, 10))
  while (d.getTime() <= f) {
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}
const fimDoMes = (mes: string) => {
  const y = +mes.slice(0, 4), m = +mes.slice(5, 7)
  return `${mes.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

export type RitmoBase = 'atual' | '3m' | 'ultimo' | 'tudo'
export const RITMOS: { base: RitmoBase; label: string }[] = [
  { base: 'atual', label: 'Mês atual projetado' },
  { base: '3m', label: 'Últimos 3 meses' },
  { base: 'ultimo', label: 'Último mês completo' },
  { base: 'tudo', label: 'Desde a assinatura' },
]
export type Ritmo = {
  base: RitmoBase
  valor: number              // R$ por mês
  meses: number              // meses completos usados na média (0 no mês atual projetado)
  disponivel: boolean
  receitaParcial?: number    // mês atual: receita já lançada
  diasDecorridos?: number    // mês atual: dias úteis já lançados
  diasTotal?: number         // mês atual: dias úteis do mês
}

// Ritmos de receita (R$/mês) para projetar as metas, só com o que já aconteceu desde a assinatura:
// mês atual projetado pelos dias úteis já lançados, média dos últimos 3 meses completos,
// último mês completo e média de todos os meses completos.
export function ritmosReceita(serie: { mes_ref: string; receita: number }[], assinatura: string, ultimaData: string | null, hoje: string): Record<RitmoBase, Ritmo> {
  const mesHoje = `${hoje.slice(0, 7)}-01`
  const desde = [...serie].filter(m => m.mes_ref >= `${assinatura.slice(0, 7)}-01`).sort((a, b) => a.mes_ref.localeCompare(b.mes_ref))
  const completos = desde.filter(m => m.mes_ref < mesHoje)
  const mediaDe = (base: RitmoBase, xs: { receita: number }[]): Ritmo =>
    ({ base, valor: xs.length ? xs.reduce((s, m) => s + m.receita, 0) / xs.length : 0, meses: xs.length, disponivel: xs.length > 0 })
  const mesAtual = desde.find(m => m.mes_ref === mesHoje)
  const noMes = !!ultimaData && ultimaData.slice(0, 7) === hoje.slice(0, 7)
  const decorridos = mesAtual && ultimaData && noMes ? diasUteis(mesHoje, ultimaData) : 0
  const total = diasUteis(mesHoje, fimDoMes(mesHoje))
  const receitaAtual = mesAtual?.receita ?? 0
  return {
    atual: {
      base: 'atual', valor: decorridos > 0 ? (receitaAtual / decorridos) * total : 0, meses: 0,
      disponivel: decorridos > 0 && receitaAtual > 0, receitaParcial: receitaAtual, diasDecorridos: decorridos, diasTotal: total,
    },
    '3m': mediaDe('3m', completos.slice(-3)),
    ultimo: mediaDe('ultimo', completos.slice(-1)),
    tudo: mediaDe('tudo', completos),
  }
}

export type Previsao = {
  mesesParaAtingir: number | null   // no ritmo dado (null: não atinge)
  dataPrevista: string | null       // 'YYYY-MM-DD'
  folgaMeses: number | null         // positivo = antes do prazo; negativo = depois
  alcanca: boolean                  // dentro do prazo
}
// Quando a meta seria atingida mantendo um ritmo de receita (R$/mês) a partir de hoje
export function preverMeta(meta: MetaAvaliada, ritmo: number, hoje: string): Previsao {
  if (meta.status === 'atingida') {
    return { mesesParaAtingir: 0, dataPrevista: meta.atingidaEm, folgaMeses: meta.atingidaEm ? mesesEntre(meta.atingidaEm, meta.prazoFim) : null, alcanca: true }
  }
  if (meta.status === 'vencida' || ritmo <= 0) return { mesesParaAtingir: null, dataPrevista: null, folgaMeses: null, alcanca: false }
  const meses = meta.faltam / ritmo
  const dataPrevista = somarDias(hoje, Math.ceil(meses * 30.4375))
  return { mesesParaAtingir: meses, dataPrevista, folgaMeses: mesesEntre(dataPrevista, meta.prazoFim), alcanca: dataPrevista <= meta.prazoFim }
}
