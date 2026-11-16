// Receita de Banking do BTG: a planilha "Artur Fonseca_DW_<mês>.xlsx" que a Delta manda (Delta Wealth),
// com o cartão de crédito, o saldo remunerado e os outros produtos bancários dos clientes do escritório.
// Não é giro: não tem lote nem tarifa e não passa pela cadeia de repasse da renda variável. Cada bloco
// da planilha tem as linhas de receita, a "Comissão total" e a "Comissão <assessor>", que é a parte do
// escritório (30 % no Banking/PME e 50 % no saldo remunerado em out/26); o quadro "DELTA WEALTH" no fim
// desconta o imposto (15 %) e dá a comissão líquida. O mês fica guardado numa importação protegida
// (importacoes.detalhes.banking), fora dos lotes, e entra no Painel ao lado da comissão do giro.
// Só funções puras (testes em banking.test.ts); quem lê e grava o banco é consultasBanking/acoesBanking.
import { dataBR, numeroBR } from './planilhas'
import { corrigirMojibake } from '@/lib/texto'
import { PRODUTOS_RV, type AbaPlanilha } from './fechamento'

export type ItemBanking = {
  grupo: string          // Banking/PME, Saldo Remunerado…
  data: string           // 'YYYY-MM-DD'
  conta: string
  cliente: string
  categoria: string      // FEE TRANSACIONAL, SALDO REMUNERADO…
  produto: string        // CARTAO DE CREDITO…
  ativo: string
  tipo: string           // Tipo Receita: FEE, Accrual…
  bruta: number
  liquida: number
  comissao: number       // o que o BTG paga sobre a linha
}
export type GrupoBanking = {
  grupo: string
  linhas: number
  clientes: number
  bruta: number
  comissao: number        // comissão que o BTG pagou no grupo
  pctEscritorio: number   // parte do escritório, em % da comissão
  parte: number           // comissão do escritório (antes do imposto)
  impostoPct: number
  imposto: number
  liquida: number         // comissão líquida do escritório
}
export type TotaisBanking = Omit<GrupoBanking, 'grupo' | 'pctEscritorio' | 'impostoPct'>
export type BankingDoMes = { mes: string; origem: string | null; grupos: GrupoBanking[]; total: TotaisBanking; itens: ItemBanking[] }
export type LeituraBanking =
  | { ok: true; mes: string; grupos: GrupoBanking[]; total: TotaisBanking; itens: ItemBanking[]; avisos: string[] }
  | { ok: false; erro: string }

// números da planilha vêm com 15 casas (accrual diário de centavos): guarda 6 e mostra 2
const r6 = (n: number) => Math.round(n * 1e6) / 1e6
const norm = (v: unknown) => corrigirMojibake(String(v ?? '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const texto = (v: unknown) => (v == null ? '' : String(v).trim())
const numero = (v: unknown): number | null => (typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' && /\d/.test(v) && !/[a-z]{2}/i.test(v) ? numeroBR(v) : null)
const iniciais = (s: string) => s.toLowerCase().replace(/(^|[\s/])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())

const COLUNAS = {
  data: ['data receita', 'data'], conta: ['conta', 'conta cliente'], cliente: ['cliente', 'nome cliente', 'nome do cliente'], categoria: ['categoria'],
  produto: ['produto'], ativo: ['ativo'], tipo: ['tipo receita', 'tipo'], bruta: ['receita bruta'], liquida: ['receita liquida'], comissao: ['comissao'],
} as const
type Campo = keyof typeof COLUNAS
const OBRIGATORIAS: Campo[] = ['data', 'cliente', 'produto', 'comissao']

// A linha é um cabeçalho de bloco quando traz as colunas de receita (cada bloco da planilha repete o cabeçalho)
function cabecalho(row: unknown[]): Partial<Record<Campo, number>> | null {
  const hs = row.map(norm)
  const cols: Partial<Record<Campo, number>> = {}
  for (const campo of Object.keys(COLUNAS) as Campo[]) {
    const j = hs.findIndex(h => (COLUNAS[campo] as readonly string[]).includes(h))
    if (j >= 0) cols[campo] = j
  }
  return OBRIGATORIAS.every(c => cols[c] != null) ? cols : null
}

// O primeiro número à direita de uma célula (o valor de "Comissão total", "Comissão Artur"…)
function numeroADireita(row: unknown[], de: number): number | null {
  for (let j = de + 1; j < row.length; j++) { const n = numero(row[j]); if (n != null) return n }
  return null
}

type Bloco = { itens: Omit<ItemBanking, 'grupo'>[]; total: number | null; parte: number | null }
type LinhaQuadro = { nome: string; parte: number; imposto: number | null; liquida: number | null }

export function lerBankingDelta(abas: AbaPlanilha[]): LeituraBanking {
  const blocos: Bloco[] = []
  const quadro: LinhaQuadro[] = []
  let impostoDoTitulo: number | null = null   // "Alíquota de Imposto 15%"
  let liquidaDoQuadro: number | null = null    // "Comissão Total" do quadro

  for (const aba of abas) {
    let cols: Partial<Record<Campo, number>> | null = null
    let bloco: Bloco | null = null
    let noQuadro: { nome: number; parte: number; imposto: number; liquida: number } | null = null
    for (const row of aba.linhas) {
      if (!Array.isArray(row)) continue
      const hs = row.map(norm)
      // quadro "DELTA WEALTH": Produto | Comissão Assessor | Alíquota de Imposto 15% | Comissão Líquida
      const jParte = hs.findIndex(h => h.startsWith('comissao assessor'))
      if (jParte >= 0 && hs.includes('produto')) {
        const jImposto = hs.findIndex(h => h.includes('imposto')), jLiquida = hs.findIndex(h => h.startsWith('comissao liquida'))
        noQuadro = { nome: hs.indexOf('produto'), parte: jParte, imposto: jImposto, liquida: jLiquida }
        const pct = jImposto >= 0 ? /(\d+(?:[.,]\d+)?)\s*%/.exec(texto(row[jImposto])) : null
        if (pct) impostoDoTitulo = numeroBR(pct[1])
        cols = null; bloco = null
        continue
      }
      if (noQuadro) {
        const nome = texto(row[noQuadro.nome])
        if (norm(nome).startsWith('comissao total')) { liquidaDoQuadro = numeroADireita(row, noQuadro.nome); noQuadro = null; continue }
        const parte = numero(row[noQuadro.parte])
        if (nome && parte != null) {
          quadro.push({ nome, parte, imposto: noQuadro.imposto >= 0 ? numero(row[noQuadro.imposto]) : null, liquida: noQuadro.liquida >= 0 ? numero(row[noQuadro.liquida]) : null })
          continue
        }
        noQuadro = null
      }
      const cab = cabecalho(row)
      if (cab) { cols = cab; bloco = { itens: [], total: null, parte: null }; blocos.push(bloco); continue }
      if (!cols || !bloco) continue
      const c = cols
      const cel = (campo: Campo) => (c[campo] == null ? null : row[c[campo]!])
      const data = dataBR(cel('data'))
      if (data) {
        bloco.itens.push({
          data, conta: texto(cel('conta')), cliente: texto(cel('cliente')), categoria: texto(cel('categoria')).toUpperCase(), produto: texto(cel('produto')).toUpperCase(),
          ativo: texto(cel('ativo')).toUpperCase(), tipo: texto(cel('tipo')), bruta: numeroBR(cel('bruta')), liquida: numeroBR(cel('liquida')), comissao: numeroBR(cel('comissao')),
        })
        continue
      }
      // rodapé do bloco: "Comissão total" e "Comissão <assessor>" (a parte do escritório)
      const jTotal = hs.findIndex(h => h.startsWith('comissao total'))
      if (jTotal >= 0) { bloco.total = numeroADireita(row, jTotal); continue }
      const jAssessor = hs.findIndex(h => h.startsWith('comissao ') && !h.startsWith('comissao total') && !h.startsWith('comissao liquida'))
      if (jAssessor >= 0) bloco.parte = numeroADireita(row, jAssessor)
    }
  }

  const comLinhas = blocos.filter(b => b.itens.length > 0)
  if (!comLinhas.length) return { ok: false, erro: 'Não achei linhas de receita de Banking (Data Receita, Cliente, Produto, Comissão) na planilha.' }
  if (comLinhas.some(b => b.itens.some(i => PRODUTOS_RV.includes(i.produto)))) {
    return { ok: false, erro: 'Esta parece a planilha do fechamento de renda variável (tem BMF ou Bolsa). Use o bloco "Fechamento do mês"; aqui entra a planilha de Banking, a "DW".' }
  }

  // o mês é o da maioria das linhas; o que for de outro mês fica de fora
  const avisos: string[] = []
  const porMes = new Map<string, number>()
  for (const b of comLinhas) for (const i of b.itens) porMes.set(i.data.slice(0, 7), (porMes.get(i.data.slice(0, 7)) ?? 0) + 1)
  const mesTxt = [...porMes.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const fora = [...porMes.entries()].filter(([m]) => m !== mesTxt).reduce((s, [, n]) => s + n, 0)
  if (fora) avisos.push(`${fora} ${fora === 1 ? 'linha de outro mês ficou' : 'linhas de outros meses ficaram'} de fora (a planilha é de ${mesTxt.slice(5, 7)}/${mesTxt.slice(0, 4)}).`)

  // de cada bloco saem o nome do grupo e os dois percentuais; os valores vêm das linhas (gruposDasLinhas),
  // pelo mesmo caminho que o servidor refaz ao gravar
  const percentuais: { grupo: string; pctEscritorio: number; impostoPct: number }[] = []
  const itens: ItemBanking[] = []
  const nomesUsados = new Set<string>()
  comLinhas.forEach((b, ordem) => {
    const doMes = b.itens.filter(i => i.data.slice(0, 7) === mesTxt)
    if (!doMes.length) return
    const comissao = doMes.reduce((s, i) => s + i.comissao, 0)
    // a linha do quadro deste bloco: a que traz a mesma parte do escritório; sem rodapé, a da mesma posição
    const doQuadro = (b.parte != null ? quadro.find(q => Math.abs(q.parte - b.parte!) < 0.005) : undefined) ?? (quadro.length === comLinhas.length ? quadro[ordem] : undefined)
    const categorias = new Map<string, number>()
    for (const i of doMes) categorias.set(i.categoria || i.produto, (categorias.get(i.categoria || i.produto) ?? 0) + 1)
    let grupo = doQuadro?.nome || iniciais([...categorias.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? 'Banking')
    for (let n = 2; nomesUsados.has(grupo); n++) grupo = `${grupo.replace(/ \d+$/, '')} ${n}`
    nomesUsados.add(grupo)
    const parte = b.parte ?? doQuadro?.parte ?? null
    if (parte == null) { avisos.push(`"${grupo}": não achei a linha "Comissão <assessor>" com a parte do escritório; considerei a comissão inteira.`) }
    if (b.total != null && Math.abs(b.total - b.itens.reduce((s, i) => s + i.comissao, 0)) > 0.005) avisos.push(`"${grupo}": a soma das linhas não bate com a "Comissão total" da planilha.`)
    const parteMes = parte == null ? comissao : fora && b.itens.length !== doMes.length ? (comissao * parte) / (b.itens.reduce((s, i) => s + i.comissao, 0) || 1) : parte
    const pctEscritorio = comissao > 0 ? (parteMes / comissao) * 100 : 0
    const impostoPct = doQuadro && doQuadro.imposto != null && doQuadro.parte > 0 ? (doQuadro.imposto / doQuadro.parte) * 100 : impostoDoTitulo ?? 0
    if (!doQuadro && impostoDoTitulo == null) avisos.push(`"${grupo}": não achei o quadro com o imposto; a comissão líquida ficou igual à parte do escritório.`)
    percentuais.push({ grupo, pctEscritorio: r6(pctEscritorio), impostoPct: r6(impostoPct) })
    for (const i of doMes) itens.push({ grupo, ...i, bruta: r6(i.bruta), liquida: r6(i.liquida), comissao: r6(i.comissao) })
  })

  const grupos = gruposDasLinhas(itens, percentuais)
  const total = somarBanking(grupos, itens)
  if (liquidaDoQuadro != null && !fora && Math.abs(liquidaDoQuadro - total.liquida) > 0.005) avisos.push('A comissão líquida calculada não bate com a "Comissão Total" do quadro da planilha.')
  return { ok: true, mes: `${mesTxt}-01`, grupos, total, itens, avisos }
}

export function somarBanking(grupos: GrupoBanking[], itens?: ItemBanking[]): TotaisBanking {
  const s = (f: (g: GrupoBanking) => number) => r6(grupos.reduce((t, g) => t + f(g), 0))
  return {
    linhas: grupos.reduce((t, g) => t + g.linhas, 0), clientes: itens ? new Set(itens.map(i => i.conta || i.cliente)).size : grupos.reduce((t, g) => t + g.clientes, 0),
    bruta: s(g => g.bruta), comissao: s(g => g.comissao), parte: s(g => g.parte), imposto: s(g => g.imposto), liquida: s(g => g.liquida),
  }
}

// Refaz os grupos a partir das linhas e dos percentuais (o servidor não confia nos totais que chegam da tela)
export function gruposDasLinhas(itens: ItemBanking[], percentuais: { grupo: string; pctEscritorio: number; impostoPct: number }[]): GrupoBanking[] {
  return percentuais.map(p => {
    const doGrupo = itens.filter(i => i.grupo === p.grupo)
    const comissao = doGrupo.reduce((s, i) => s + i.comissao, 0)
    const parte = (comissao * p.pctEscritorio) / 100, imposto = (parte * p.impostoPct) / 100
    return {
      grupo: p.grupo, linhas: doGrupo.length, clientes: new Set(doGrupo.map(i => i.conta || i.cliente)).size, bruta: r6(doGrupo.reduce((s, i) => s + i.bruta, 0)), comissao: r6(comissao),
      pctEscritorio: r6(p.pctEscritorio), parte: r6(parte), impostoPct: r6(p.impostoPct), imposto: r6(imposto), liquida: r6(parte - imposto),
    }
  }).filter(g => g.linhas > 0)
}

// ── O que fica gravado (importacoes.detalhes.banking) ──────────────────────────
const numDe = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : 0)
const txtDe = (v: unknown) => (v == null ? '' : String(v))

// Lê o que foi gravado sem confiar no formato (devolve null quando não é um mês de Banking)
export function lerBankingGravado(v: unknown): BankingDoMes | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const mes = txtDe(o.mes)
  if (!/^\d{4}-\d{2}-01$/.test(mes) || !Array.isArray(o.grupos)) return null
  const grupos = (o.grupos as Record<string, unknown>[]).map<GrupoBanking>(g => ({
    grupo: txtDe(g.grupo), linhas: numDe(g.linhas), clientes: numDe(g.clientes), bruta: numDe(g.bruta), comissao: numDe(g.comissao), pctEscritorio: numDe(g.pctEscritorio),
    parte: numDe(g.parte), impostoPct: numDe(g.impostoPct), imposto: numDe(g.imposto), liquida: numDe(g.liquida),
  }))
  const itens = (Array.isArray(o.itens) ? (o.itens as Record<string, unknown>[]) : []).map<ItemBanking>(i => ({
    grupo: txtDe(i.grupo), data: txtDe(i.data), conta: txtDe(i.conta), cliente: txtDe(i.cliente), categoria: txtDe(i.categoria), produto: txtDe(i.produto), ativo: txtDe(i.ativo), tipo: txtDe(i.tipo),
    bruta: numDe(i.bruta), liquida: numDe(i.liquida), comissao: numDe(i.comissao),
  }))
  return { mes, origem: o.origem == null ? null : txtDe(o.origem), grupos, total: somarBanking(grupos, itens.length ? itens : undefined), itens }
}

// Um total por mês (se o mesmo mês foi gravado duas vezes, vale o primeiro da lista: a mais recente)
export function bankingPorMes(meses: BankingDoMes[]): Map<string, BankingDoMes> {
  const out = new Map<string, BankingDoMes>()
  for (const m of meses) if (!out.has(m.mes)) out.set(m.mes, m)
  return out
}
