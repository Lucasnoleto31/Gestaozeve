// Fechamento mensal do BTG na tela: lê a planilha "Artur Fonseca_<mês>.xlsx" (a aba do escritório e as
// abas dos parceiros), cruza com os lotes do mês (cliente × dia × ativo) e monta o plano de ajuste —
// corretagem manual por operação, lançamentos que faltaram e o que não dá para ajustar.
// Regra (fechamentos de set e out/26): o BTG paga a receita bruta com os impostos embutidos no preço;
// a receita do sistema tem de bater com bruta × (1 − impostos embutidos), por cliente, dia e ativo.
// Só funções puras (testes em fechamento.test.ts); quem lê e grava o banco é acoesFechamento.ts.
import { dataBR, numeroBR } from './planilhas'
import { corrigirMojibake } from '@/lib/texto'

// ── 1. Leitura da planilha ────────────────────────────────────────────────────
export type AbaPlanilha = { nome: string; linhas: unknown[][] }
export type LinhaFechamento = {
  aba: string
  linha: number          // nº da linha na planilha (1 = primeira)
  data: string           // 'YYYY-MM-DD'
  conta: string          // como veio ('038427324')
  conta_sz: string       // sem zeros à esquerda
  cliente: string
  categoria: string
  produto: string        // BMF, BOLSA, ALUGUEL, CDB, SALDO REMUNERADO DIGITAL…
  ativo: string
  tipo: string           // Tipo Receita
  bruta: number
  liquida: number
  comissao: number
}
export type TotalProduto = { produto: string; linhas: number; bruta: number; liquida: number; comissao: number }
export type ResumoFechamento = {
  linhas: number
  dias: number
  bruta: number
  liquida: number
  comissao: number
  rv: TotalProduto               // BMF + BOLSA: o que o sistema modela (lotes × tarifa + zeragem)
  foraRv: TotalProduto[]         // o resto (aluguel, CDB, saldo remunerado…): fora do modelo
  pctComissao: number | null     // comissão ÷ líquida dos produtos de RV, em % (o percentual que o BTG pagou no mês)
  porAba: { aba: string; linhas: number; bruta: number; comissao: number }[]
}
export type LeituraFechamento =
  | { ok: true; linhas: LinhaFechamento[]; mes: string; avisos: string[]; resumo: ResumoFechamento }
  | { ok: false; erro: string }

export const PRODUTOS_RV = ['BMF', 'BOLSA']
const norm = (v: unknown) => corrigirMojibake(String(v ?? '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const COLUNAS = {
  data: ['data receita', 'data'], conta: ['conta', 'conta cliente'], cliente: ['cliente', 'nome cliente', 'nome do cliente'], categoria: ['categoria'],
  produto: ['produto'], ativo: ['ativo'], tipo: ['tipo receita', 'tipo'], bruta: ['receita bruta'], liquida: ['receita liquida'], comissao: ['comissao'],
} as const
type Campo = keyof typeof COLUNAS
const OBRIGATORIAS: Campo[] = ['data', 'conta', 'cliente', 'produto', 'bruta']
const texto = (v: unknown) => (v == null ? '' : String(v).trim())
const sz = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '')
const r2 = (n: number) => Math.round(n * 100) / 100

function acharCabecalho(linhas: unknown[][]): { indice: number; cols: Partial<Record<Campo, number>> } | null {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const hs = (linhas[i] ?? []).map(norm)
    const cols: Partial<Record<Campo, number>> = {}
    for (const campo of Object.keys(COLUNAS) as Campo[]) {
      const j = hs.findIndex(h => (COLUNAS[campo] as readonly string[]).includes(h))
      if (j >= 0) cols[campo] = j
    }
    if (OBRIGATORIAS.every(c => cols[c] != null)) return { indice: i, cols }
  }
  return null
}

export function lerFechamentoBtg(abas: AbaPlanilha[]): LeituraFechamento {
  const linhas: LinhaFechamento[] = []
  const avisos: string[] = []
  let abasLidas = 0
  for (const aba of abas) {
    const cab = acharCabecalho(aba.linhas)
    if (!cab) { avisos.push(`Aba "${aba.nome}" ignorada: não tem as colunas do fechamento.`); continue }
    abasLidas++
    const c = cab.cols
    const cel = (row: unknown[], campo: Campo) => (c[campo] == null ? null : row[c[campo]!])
    for (let i = cab.indice + 1; i < aba.linhas.length; i++) {
      const row = aba.linhas[i] ?? []
      const data = dataBR(cel(row, 'data'))
      if (!data) continue                      // bloco de resumo no fim da aba, linhas em branco
      const conta = texto(cel(row, 'conta'))
      linhas.push({
        aba: aba.nome, linha: i + 1, data, conta, conta_sz: sz(conta), cliente: texto(cel(row, 'cliente')), categoria: texto(cel(row, 'categoria')).toUpperCase(),
        produto: texto(cel(row, 'produto')).toUpperCase(), ativo: texto(cel(row, 'ativo')).toUpperCase(), tipo: texto(cel(row, 'tipo')),
        bruta: numeroBR(cel(row, 'bruta')), liquida: numeroBR(cel(row, 'liquida')), comissao: numeroBR(cel(row, 'comissao')),
      })
    }
  }
  if (!abasLidas) return { ok: false, erro: 'Não achei as colunas do fechamento (Data Receita, Conta, Cliente, Produto, Receita Bruta) em nenhuma aba.' }
  if (!linhas.length) return { ok: false, erro: 'A planilha não tem linhas de receita com data.' }

  // o mês do fechamento é o das linhas; o que for de outro mês fica de fora
  const porMes = new Map<string, number>()
  for (const l of linhas) porMes.set(l.data.slice(0, 7), (porMes.get(l.data.slice(0, 7)) ?? 0) + 1)
  const mesTxt = [...porMes.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const doMes = linhas.filter(l => l.data.slice(0, 7) === mesTxt)
  const outras = linhas.length - doMes.length
  if (outras) avisos.push(`${outras} ${outras === 1 ? 'linha de outro mês ficou' : 'linhas de outros meses ficaram'} de fora (o fechamento é de ${mesTxt.slice(5, 7)}/${mesTxt.slice(0, 4)}).`)

  const soma = (xs: LinhaFechamento[]): Omit<TotalProduto, 'produto'> => ({
    linhas: xs.length, bruta: r2(xs.reduce((s, l) => s + l.bruta, 0)), liquida: r2(xs.reduce((s, l) => s + l.liquida, 0)), comissao: r2(xs.reduce((s, l) => s + l.comissao, 0)),
  })
  const rvLinhas = doMes.filter(l => PRODUTOS_RV.includes(l.produto))
  const rv = { produto: 'RV', ...soma(rvLinhas) }
  const rvLiquida = rvLinhas.reduce((s, l) => s + l.liquida, 0), rvComissao = rvLinhas.reduce((s, l) => s + l.comissao, 0)
  const produtos = [...new Set(doMes.filter(l => !PRODUTOS_RV.includes(l.produto)).map(l => l.produto))].sort()
  const foraRv = produtos.map(p => ({ produto: p, ...soma(doMes.filter(l => l.produto === p)) }))
  const abasNomes = [...new Set(doMes.map(l => l.aba))]
  const total = soma(doMes)
  return {
    ok: true, linhas: doMes, mes: `${mesTxt}-01`, avisos,
    resumo: {
      ...total, dias: new Set(doMes.map(l => l.data)).size, rv, foraRv,
      pctComissao: rvLiquida > 0 ? Math.round((rvComissao / rvLiquida) * 10000) / 100 : null,
      porAba: abasNomes.map(a => { const xs = doMes.filter(l => l.aba === a); return { aba: a, linhas: xs.length, bruta: r2(xs.reduce((s, l) => s + l.bruta, 0)), comissao: r2(xs.reduce((s, l) => s + l.comissao, 0)) } }),
    },
  }
}

// ── 2. Cruzamento com os lotes do mês ────────────────────────────────────────
export type LoteSistema = {
  id: string
  data: string
  cliente_id: string | null
  conta: string | null
  ativo: string | null
  qtd: number
  zeragem: boolean
  posicao: boolean
  acoes: boolean
  conta_para_receita: boolean
  tarifa: number                 // em uso (manual, se houver, senão a do cadastro)
  tarifa_manual: number | null
  zeragem_rs: number
}
export type ContaSistema = { conta: string; cliente_id: string }
export type TarifaSistema = { cliente_id: string; vigencia: string; corretagem: number }
export type ConfigCruzamento = {
  fator: number                  // 1 − impostos embutidos no preço (0,9035 no BTG)
  tolerancia?: number            // diferença por cliente/dia/ativo que não conta (R$ 0,035: cada linha do BTG vem ~R$ 0,015 abaixo)
  padraoBtg?: number             // corretagem padrão do BTG, líquida, para quem está fora do grupo (R$ 0,95/lote)
  zeragemManual?: boolean        // S60 aplicada: as linhas de zeragem aceitam corretagem manual
}
export type ItemTarifa = { id: string; tarifa: number }
export type LancamentoNovo = {
  cliente_id: string
  conta: string                  // conta do BTG, sem zeros à esquerda
  data: string
  ativo: string                  // já no formato do sistema (WINZ26)
  tipo: 'futuro' | 'acao'
  qtd: number
  tarifa_manual: number | null   // null = corretagem do cadastro
  motivo: string
}
export type AcaoCaso =
  | { tipo: 'tarifa'; itens: ItemTarifa[]; resumo: string; residuo?: number }   // corretagem manual nas operações do dia
  | { tipo: 'inserir'; lancamento: LancamentoNovo; resumo: string }
  | { tipo: 'residuo'; valor: number; resumo: string }                           // diferença que fica (zeragem sem ajuste manual)
  | { tipo: 'manter'; resumo: string }                                           // diferença pequena, mantida
  | { tipo: 'sem_inferencia'; resumo: string }
export type CasoFechamento = {
  chave: string                  // '<cliente>|<data>|<ativo>'
  cliente_id: string
  cliente: string
  data: string
  ativo: string                  // 'FUT:WIN' · 'ACAO:PETR4'
  btg: number                    // o que o BTG pagou, já sem os impostos embutidos
  sistema: number                // receita lançada no sistema
  dif: number                    // btg − sistema
  acao: AcaoCaso
}
export type SemCadastro = { conta: string; cliente: string; linhas: number; bruta: number }
export type PlanoFechamento = {
  mes: string
  casos: CasoFechamento[]
  semCadastro: SemCadastro[]     // contas do fechamento (RV) que o sistema não conhece
  lotesSemCliente: number        // lançamentos do mês sem cliente (não entram no cruzamento)
  totais: { btg: number; sistema: number; dif: number; aAjustar: number; aInserir: number; residuo: number; manter: number; semInferencia: number }
}

const FUT = /^[A-Z]{3}F?[FGHJKMNQUVXZ][0-9]{2}$/
// WIN/WDO e vencimentos pelo radical; ações pelo código (PETR4F = fracionário de PETR4)
export function chaveAtivo(ativo: string | null | undefined): string {
  const a = (ativo ?? '').toUpperCase().trim()
  if (FUT.test(a)) return `FUT:${a.slice(0, 3)}`
  return `ACAO:${/^[A-Z]{4}\d{1,2}F$/.test(a) ? a.slice(0, -1) : a}`
}
// Ativo do BTG no formato do sistema: WINFZ26 → WINZ26
export const ativoDoSistema = (ativo: string) => ativo.toUpperCase().replace(/^([A-Z]{3})F([FGHJKMNQUVXZ]\d{2})$/, '$1$2')

export function receitaDoLote(l: LoteSistema): number {
  if (!l.conta_para_receita) return 0
  if (l.zeragem) return l.qtd * (l.zeragem_rs || 0)
  if (l.acoes || l.posicao) return l.tarifa || 0
  return l.qtd * (l.tarifa || 0)
}
const r4 = (n: number) => Math.round(n * 10000) / 10000
const inteiro = (x: number, tol: number) => Math.abs(x - Math.round(x)) <= tol && Math.round(x) >= 1
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt4 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const g = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export function cruzarFechamento(
  fech: LinhaFechamento[], lotes: LoteSistema[], contas: ContaSistema[], nomes: Map<string, string>, tarifas: TarifaSistema[], cfg: ConfigCruzamento, mes: string,
): PlanoFechamento {
  const TOL = cfg.tolerancia ?? 0.035
  const PADRAO = cfg.padraoBtg ?? 0.95
  const contaCli = new Map(contas.map(c => [sz(c.conta), c.cliente_id]))
  const tarifasDe = new Map<string, TarifaSistema[]>()
  for (const t of tarifas) { const xs = tarifasDe.get(t.cliente_id) ?? []; xs.push(t); tarifasDe.set(t.cliente_id, xs) }
  const tarifaCadastro = (cid: string, data: string) => {
    const v = (tarifasDe.get(cid) ?? []).filter(t => t.vigencia <= data).sort((a, b) => a.vigencia.localeCompare(b.vigencia))
    return v.length ? v[v.length - 1].corretagem : 0
  }
  const nome = (cid: string) => nomes.get(cid) ?? '?'

  // B: fechamento (só RV) por cliente × dia × ativo; S: lotes do mês idem
  const B = new Map<string, LinhaFechamento[]>()
  const semCad = new Map<string, SemCadastro>()
  for (const l of fech) {
    if (!PRODUTOS_RV.includes(l.produto) || l.data.slice(0, 7) !== mes.slice(0, 7)) continue
    const cid = contaCli.get(l.conta_sz)
    if (!cid) {
      const s = semCad.get(l.conta_sz) ?? { conta: l.conta, cliente: l.cliente, linhas: 0, bruta: 0 }
      s.linhas++; s.bruta = r2(s.bruta + l.bruta); semCad.set(l.conta_sz, s)
      continue
    }
    const k = `${cid}|${l.data}|${chaveAtivo(l.ativo)}`
    const xs = B.get(k) ?? []; xs.push(l); B.set(k, xs)
  }
  const S = new Map<string, LoteSistema[]>()
  let lotesSemCliente = 0
  for (const l of lotes) {
    if (l.data.slice(0, 7) !== mes.slice(0, 7)) continue
    if (!l.cliente_id) { lotesSemCliente++; continue }
    const k = `${l.cliente_id}|${l.data}|${chaveAtivo(l.ativo)}`
    const xs = S.get(k) ?? []; xs.push(l); S.set(k, xs)
  }

  // futuros: se o dia inteiro do cliente bate (WIN + WDO…), a divisão entre ativos não importa
  const diaT = new Map<string, number>(), diaS = new Map<string, number>()
  const chaves = new Set([...B.keys(), ...S.keys()])
  for (const k of chaves) {
    if (!k.split('|')[2].startsWith('FUT:')) continue
    const d = k.slice(0, k.lastIndexOf('|'))
    diaT.set(d, (diaT.get(d) ?? 0) + (B.get(k) ?? []).reduce((s, x) => s + x.bruta, 0) * cfg.fator)
    diaS.set(d, (diaS.get(d) ?? 0) + (S.get(k) ?? []).reduce((s, x) => s + receitaDoLote(x), 0))
  }

  const casos: CasoFechamento[] = []
  const ambiguos: { cid: string; alternativa: AcaoCaso }[] = []   // índice em `casos` = posição em que foram empilhados
  const ordenadas = [...chaves].sort((a, b) => {
    const [ca, da, aa] = a.split('|'), [cb, db, ab] = b.split('|')
    return nome(ca).localeCompare(nome(cb), 'pt-BR') || da.localeCompare(db) || aa.localeCompare(ab)
  })
  for (const k of ordenadas) {
    const [cid, data, ch] = k.split('|')
    const futuro = ch.startsWith('FUT:')
    const d = `${cid}|${data}`
    if (futuro && Math.abs((diaT.get(d) ?? 0) - (diaS.get(d) ?? 0)) <= TOL) continue
    const b = B.get(k) ?? [], s = S.get(k) ?? []
    const T = b.reduce((x, l) => x + l.bruta, 0) * cfg.fator
    const conta = s.filter(x => x.conta_para_receita)
    const normais = conta.filter(x => !x.zeragem && !x.posicao && !x.acoes)
    const zer = conta.filter(x => x.zeragem)
    const pos = conta.filter(x => x.posicao)
    const ac = conta.filter(x => x.acoes)
    const Sv = s.reduce((x, l) => x + receitaDoLote(l), 0)
    const dif = T - Sv
    if (Math.abs(dif) <= TOL) continue
    const base = { chave: k, cliente_id: cid, cliente: nome(cid), data, ativo: ch, btg: r2(T), sistema: r2(Sv), dif: r2(dif) }
    // corretagem manual só quando muda o que a linha já produz
    const marcar = (itens: ItemTarifa[], l: LoteSistema, valor: number) => { const v = r4(valor); if (Math.abs((l.tarifa || 0) - v) >= 0.00005 || (l.zeragem && Math.abs((l.zeragem_rs || 0) - v) >= 0.00005)) itens.push({ id: l.id, tarifa: v }) }
    const novo = (tipo: LancamentoNovo['tipo'], qtd: number, tarifa_manual: number | null, motivo: string): LancamentoNovo =>
      ({ cliente_id: cid, conta: b[0].conta_sz, data, ativo: futuro ? ativoDoSistema(b[0].ativo) : b[0].ativo, tipo, qtd, tarifa_manual, motivo })
    let acao: AcaoCaso

    if (futuro) {
      const zerRev = zer.reduce((x, l) => x + receitaDoLote(l), 0)
      const qn = normais.reduce((x, l) => x + l.qtd, 0)
      const qz = zer.reduce((x, l) => x + l.qtd, 0)
      const tn = normais[0]?.tarifa ?? 0
      const qp = pos.reduce((x, l) => x + l.qtd, 0)
      if (normais.length && pos.length && dif > 0 && Math.abs(dif - qp * tn) <= 0.06) {
        const itens: ItemTarifa[] = []; marcar(itens, pos[0], dif)
        acao = { tipo: 'tarifa', itens, resumo: `posição de ${g(qp)} contrato(s) cobrada: corretagem fixa ${fmt(dif)}` }
      } else if (normais.length && zer.length && T - zerRev > 0 && Math.abs(dif) <= 0.04 * zerRev) {
        acao = { tipo: 'manter', resumo: 'diferença pequena num dia com zeragem (imposto embutido diferente); mantido' }
      } else if (normais.length && dif > 0 && tn > 0 && inteiro((T + 0.015 - zerRev) / tn, 0.12)
        && Math.round((T + 0.015 - zerRev) / tn) - qn > 0 && Math.round((T + 0.015 - zerRev) / tn) - qn <= 0.3 * qn && (Math.round((T + 0.015 - zerRev) / tn) - qn) % 2 === 0) {
        const falta = Math.round((T + 0.015 - zerRev) / tn) - qn
        acao = { tipo: 'inserir', lancamento: novo('futuro', falta, null, 'lotes que faltaram no relatório do dia'), resumo: `faltaram ${g(falta)} lotes no relatório (lançados ${g(qn)}, o BTG pagou ${g(qn + falta)}): lançar` }
      } else if (normais.length) {
        const alvo = T - zerRev
        if (alvo < -0.05) {
          // o BTG pagou menos que a zeragem lançada: lotes a zero e a zeragem ao que foi pago (com a S60) ou fica como resíduo
          const itens: ItemTarifa[] = []
          for (const x of normais) marcar(itens, x, 0)
          if (cfg.zeragemManual && qz > 0) {
            for (const x of zer) marcar(itens, x, Math.max(0, T) / qz)
            acao = { tipo: 'tarifa', itens, resumo: `${g(qn)} lotes sem pagamento: corretagem → 0 · zeragem de ${g(qz)} contratos ${T > 0.005 ? `paga a ${fmt4(Math.max(0, T) / qz)}/contrato` : 'não paga: → 0'}` }
          } else {
            acao = { tipo: 'tarifa', itens, residuo: r2(zerRev - Math.max(0, T)), resumo: `${g(qn)} lotes sem pagamento: corretagem → 0 · sobra zeragem de ${fmt(zerRev - Math.max(0, T))} sem pagamento (zeragem não aceita ajuste sem a S60)` }
          }
        } else {
          const preco = Math.max(0, alvo) / qn
          const itens: ItemTarifa[] = []
          for (const x of normais) marcar(itens, x, preco)
          acao = { tipo: 'tarifa', itens, resumo: T > 0.005 ? `${g(qn)} lotes: corretagem ${fmt4(tn)} → ${fmt4(preco)}` : `${g(qn)} lotes sem pagamento do BTG: corretagem → 0` }
        }
      } else if (pos.length) {
        const itens: ItemTarifa[] = []
        marcar(itens, pos[0], Math.max(0, T - zerRev))
        for (const x of pos.slice(1)) if (x.tarifa_manual != null || (x.tarifa || 0) !== 0) marcar(itens, x, 0)
        acao = { tipo: 'tarifa', itens, resumo: `posição: corretagem fixa ${fmt(Math.max(0, T - zerRev))}` }
      } else if (zer.length) {
        // só zeragem no sistema: o BTG não pagou (ou pagou outro valor)
        if (cfg.zeragemManual && qz > 0) {
          const itens: ItemTarifa[] = []
          for (const x of zer) marcar(itens, x, Math.max(0, T) / qz)
          acao = { tipo: 'tarifa', itens, resumo: T > 0.005 ? `zeragem de ${g(qz)} contratos paga a ${fmt4(Math.max(0, T) / qz)}/contrato (lançada a ${fmt4(zer[0].zeragem_rs)})` : `zeragem de ${g(qz)} contratos não paga: → 0` }
        } else {
          acao = { tipo: 'residuo', valor: r2(zerRev - Math.max(0, T)), resumo: T > 0.005 ? 'zeragem paga por outro valor (zeragem não aceita ajuste sem a S60)' : 'zeragem lançada e não paga pelo BTG (zeragem não aceita ajuste sem a S60)' }
        }
      } else {
        // dia pago sem lançamento no sistema: quantos lotes o valor representa?
        const t = tarifaCadastro(cid, data)
        const a = t > 0 ? (T + 0.015) / t : 0
        const pd = (T + 0.015) / PADRAO
        const cadOk = t > 0 && inteiro(a, 0.12) && Math.round(a) % 2 === 0
        const padOk = inteiro(pd, 0.06)
        const pelaCadastro = (): AcaoCaso => ({ tipo: 'inserir', lancamento: novo('futuro', Math.round(a), null, 'dia sem lançamento; corretagem do cadastro'), resumo: `dia sem lançamento: lançar ${g(Math.round(a))} lotes a ${fmt4(t)} (cadastro)` })
        const peloPadrao = (): AcaoCaso => ({ tipo: 'inserir', lancamento: novo('futuro', Math.round(pd), r4(T / Math.round(pd)), 'dia sem lançamento; corretagem padrão do BTG'), resumo: `dia sem lançamento: lançar ${g(Math.round(pd))} lotes a ${fmt4(T / Math.round(pd))} (preço padrão do BTG)` })
        // as duas corretagens dão um número inteiro de lotes: decide pelo que o cliente pagou nos outros dias do mês
        if (cadOk && padOk) { acao = pelaCadastro(); ambiguos.push({ cid, alternativa: peloPadrao() }) }
        else if (cadOk) acao = pelaCadastro()
        else if (padOk) acao = peloPadrao()
        else acao = { tipo: 'sem_inferencia', resumo: `dia pago (${fmt(T)}) sem lançamento e sem corretagem que dê um número inteiro de lotes: conferir à mão` }
      }
    } else if (ac.length) {
      const itens: ItemTarifa[] = []
      marcar(itens, ac[0], T)
      for (const x of ac.slice(1)) marcar(itens, x, 0)
      acao = { tipo: 'tarifa', itens, resumo: `ações (day trade): corretagem fixa ${fmt(ac[0].tarifa || 0)} → ${fmt(T)}` }
    } else if (pos.length) {
      const itens: ItemTarifa[] = []
      marcar(itens, pos[0], T)
      for (const x of pos.slice(1)) if (x.tarifa_manual != null || (x.tarifa || 0) !== 0) marcar(itens, x, 0)
      acao = { tipo: 'tarifa', itens, resumo: `posição em ações: corretagem fixa ${fmt(T)}` }
    } else if (b.length) {
      acao = { tipo: 'inserir', lancamento: novo('acao', 0, r4(T), 'corretagem de ações paga pelo BTG sem lançamento no dia'), resumo: `lançar posição em ações com corretagem fixa ${fmt(T)}` }
    } else {
      acao = { tipo: 'sem_inferencia', resumo: `ações lançadas (${fmt(Sv)}) sem pagamento do BTG: conferir à mão` }
    }
    // nada a gravar: ou já está tudo como o BTG pagou, ou só sobra a zeragem (que não aceita ajuste sem a S60)
    if (acao.tipo === 'tarifa' && acao.itens.length === 0) {
      acao = acao.residuo
        ? { tipo: 'residuo', valor: acao.residuo, resumo: 'lotes já a zero; sobra a zeragem lançada e não paga pelo BTG (zeragem não aceita ajuste sem a S60)' }
        : { tipo: 'manter', resumo: 'as operações já estão com a corretagem paga; nada a mudar' }
    }
    casos.push({ ...base, acao })
  }

  // dia sem lançamento em que tanto a corretagem do cadastro quanto o preço padrão dão lotes inteiros:
  // vale o padrão quando o cliente aparece pagando o padrão em outro dia do mês (lançado ou proposto)
  if (ambiguos.length) {
    const pagaPadrao = new Set<string>()
    const proximo = (v: number) => Math.abs(v - PADRAO) <= 0.01
    for (const l of lotes) if (l.cliente_id && !l.zeragem && !l.posicao && !l.acoes && proximo(l.tarifa)) pagaPadrao.add(l.cliente_id)
    for (const c of casos) if (c.acao.tipo === 'tarifa' && c.acao.itens.some(i => proximo(i.tarifa))) pagaPadrao.add(c.cliente_id)
    for (const c of casos) {
      if (c.acao.tipo !== 'inserir' || !pagaPadrao.has(c.cliente_id)) continue
      const amb = ambiguos.find(x => x.cid === c.cliente_id && x.alternativa.tipo === 'inserir' && x.alternativa.lancamento.data === c.data)
      if (amb) c.acao = amb.alternativa
    }
  }

  const totalBtg = [...B.values()].flat().reduce((x, l) => x + l.bruta, 0) * cfg.fator
  const totalSis = [...S.values()].flat().reduce((x, l) => x + receitaDoLote(l), 0)
  return {
    mes, casos, semCadastro: [...semCad.values()].sort((a, b) => b.bruta - a.bruta), lotesSemCliente,
    totais: {
      btg: r2(totalBtg), sistema: r2(totalSis), dif: r2(totalBtg - totalSis),
      aAjustar: casos.reduce((n, c) => n + (c.acao.tipo === 'tarifa' ? c.acao.itens.length : 0), 0),
      aInserir: casos.filter(c => c.acao.tipo === 'inserir').length,
      residuo: r2(casos.reduce((n, c) => n + (c.acao.tipo === 'residuo' ? c.acao.valor : c.acao.tipo === 'tarifa' ? (c.acao.residuo ?? 0) : 0), 0)),
      manter: casos.filter(c => c.acao.tipo === 'manter').length,
      semInferencia: casos.filter(c => c.acao.tipo === 'sem_inferencia').length,
    },
  }
}

// O que vai para o banco quando o usuário aplica: as corretagens e os lançamentos dos casos escolhidos
export function escolhasDoPlano(plano: PlanoFechamento, chaves: Set<string>): { updates: ItemTarifa[]; inserts: LancamentoNovo[] } {
  const updates: ItemTarifa[] = [], inserts: LancamentoNovo[] = []
  for (const c of plano.casos) {
    if (!chaves.has(c.chave)) continue
    if (c.acao.tipo === 'tarifa') updates.push(...c.acao.itens)
    else if (c.acao.tipo === 'inserir') inserts.push(c.acao.lancamento)
  }
  return { updates, inserts }
}
export const aplicavel = (c: CasoFechamento) => c.acao.tipo === 'inserir' || (c.acao.tipo === 'tarifa' && c.acao.itens.length > 0)

// 'AAAA-MM:pct;…' com o mês do fechamento gravado por cima do que havia
export function pctMesComFechamento(atual: Record<string, number>, mes: string, pct: number): string {
  const out = { ...atual, [mes.slice(0, 7)]: Math.round(pct * 100) / 100 }
  return Object.keys(out).sort().map(m => `${m}:${out[m]}`).join(';')
}
