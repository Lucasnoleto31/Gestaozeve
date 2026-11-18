// Remuneração da equipe por níveis (S62). Só funções puras: os testes ficam em remuneracao.test.ts e a leitura
// do banco em consultasRemuneracao.ts.
//
// Lucas, 18/11/2026, sobre a tabela de 4 níveis: "vamos deixar assim"; sobre o começo: "pode fazer valer já
// para novembro mesmo". A conta de cada pessoa no mês:
//  · eventos: os do motor de comissões (comissao_eventos: abertura, ativação e reativação, inclusive a campanha);
//  · segunda metade da reativação: reativação feita já no modelo cujo cliente ainda gira 3 meses depois (a de
//    antes do modelo foi paga inteira pela regra por conta);
//  · base ativa: os clientes em que a pessoa fez o último movimento (abriu, ativou ou reativou) e que giraram no
//    mês. O líquido de cada um paga o bônus (cheio nos 12 meses depois do movimento, metade depois) e dá pontos;
//  · pontos: ativação (por corretora), reativação e cada R$ 1.000 de líquido da base;
//  · nível: revisto a cada 3 meses desde a entrada no modelo, pela média dos pontos dos 3 meses anteriores (só
//    os meses trabalhados). Sobe na revisão em que a média passa do limite; desce só depois de duas revisões
//    seguidas abaixo;
//  · valor: fixo do nível + cada evento pelo valor do nível + bônus. Antes do modelo vale a comissão por conta.
import { somarMeses } from './meses'

export type TipoEvento = 'abertura' | 'ativacao' | 'reativacao'

export type Nivel = {
  nivel: number
  pontosMin: number         // média de pontos por mês a partir da qual vale
  fixo: number
  abertura: number          // por conta aberta
  ativacao: number          // por cliente novo que gira
  reativacaoVolta: number   // quando o cliente parado volta a girar
  reativacao3Meses: number  // se ainda gira 3 meses depois
  bonus1Ano: number         // fração do líquido da base (0,05 = 5 %) nos 12 meses depois do movimento
  bonusDepois: number
}
export type TabelaNiveis = { vigencia: string; niveis: Nivel[] }   // níveis em ordem

export type Regua = {
  vigencia: string
  pontosAbertura: number
  pontosAtivacao: Record<string, number>   // por corretora
  pontosReativacao: number
  reaisPorPonto: number                    // líquido da base que vale 1 ponto
  mesesBonusCheio: number
  mesesRevisao: number
  mesesPermanencia: number
  genialRetencaoPct: number                // o que a Genial fica da corretagem e da zeragem
  genialPisCofinsPct: number
  genialIrPct: number
  genialPlataformaLote: number             // custo de plataforma por lote
}

export type PessoaModelo = { nome: string; nivelDesde: string; trabalhaDesde: string | null }

// Um evento do motor de comissões (comissao_eventos), com o valor pela regra por conta
export type EventoComissao = { pessoa: string; cliente_id: string; nome: string; corretora: string; tipo: TipoEvento; data: string; mes_ref: string; valor: number }

// A tabela que o Lucas fechou em 18/11/2026 (a mesma que a S62 grava): usada quando o banco ainda não tem a S62
// no ambiente de desenvolvimento e como referência dos testes
export const NIVEIS_PADRAO: TabelaNiveis = {
  vigencia: '2026-11-01',
  niveis: [
    { nivel: 1, pontosMin: 0, fixo: 1000, abertura: 10, ativacao: 20, reativacaoVolta: 10, reativacao3Meses: 10, bonus1Ano: 0.025, bonusDepois: 0.0125 },
    { nivel: 2, pontosMin: 10, fixo: 1500, abertura: 15, ativacao: 25, reativacaoVolta: 12.5, reativacao3Meses: 12.5, bonus1Ano: 0.05, bonusDepois: 0.025 },
    { nivel: 3, pontosMin: 30, fixo: 2000, abertura: 25, ativacao: 80, reativacaoVolta: 40, reativacao3Meses: 40, bonus1Ano: 0.1, bonusDepois: 0.05 },
    { nivel: 4, pontosMin: 60, fixo: 3000, abertura: 50, ativacao: 150, reativacaoVolta: 75, reativacao3Meses: 75, bonus1Ano: 0.2, bonusDepois: 0.1 },
  ],
}
export const REGUA_PADRAO: Regua = {
  vigencia: '2026-11-01', pontosAbertura: 0, pontosAtivacao: { GENIAL: 1, BTG: 1, XP: 1 }, pontosReativacao: 1, reaisPorPonto: 1000,
  mesesBonusCheio: 12, mesesRevisao: 3, mesesPermanencia: 3, genialRetencaoPct: 30.1, genialPisCofinsPct: 6.65, genialIrPct: 1.5, genialPlataformaLote: 0.021,
}

export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
const mesDoDia = (iso: string) => `${iso.slice(0, 7)}-01`
const chaveConta = (cliente_id: string, corretora: string) => `${cliente_id}|${corretora}`
export const chaveMes = (cliente_id: string, corretora: string, mes: string) => `${cliente_id}|${corretora}|${mes}`
const mesesEntre = (de: string, ate: string) => (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7))

// A versão em vigor no mês (a de vigência mais recente até ele); antes da primeira, a primeira
export function vigente<T extends { vigencia: string }>(lista: T[], mes: string): T | null {
  const ordem = [...lista].sort((a, b) => a.vigencia.localeCompare(b.vigencia))
  let achado: T | null = ordem[0] ?? null
  for (const x of ordem) if (x.vigencia <= mes) achado = x
  return achado
}

// O nível que uma média alcança (o maior com pontosMin ≤ média)
export function nivelDaMedia(tabela: TabelaNiveis, media: number): Nivel {
  const ordem = [...tabela.niveis].sort((a, b) => a.nivel - b.nivel)
  let achado = ordem[0]
  for (const n of ordem) if (media + 1e-9 >= n.pontosMin) achado = n
  return achado
}
export const nivelDaTabela = (tabela: TabelaNiveis, nivel: number): Nivel => {
  const ordem = [...tabela.niveis].sort((a, b) => a.nivel - b.nivel)
  return ordem.find(n => n.nivel === nivel) ?? (nivel > ordem[ordem.length - 1].nivel ? ordem[ordem.length - 1] : ordem[0])
}

// ── Líquido de cada cliente no mês ─────────────────────────────────────────────
// Genial: corretagem e zeragem × o que fica depois da Genial, PIS/COFINS e IR (R$ 0,64 por R$ 1), mais o
// incentivo, menos a plataforma e a parte de parceiro com participação no cliente
export const fatorGenial = (r: Regua) => (1 - r.genialRetencaoPct / 100) * (1 - r.genialPisCofinsPct / 100) * (1 - r.genialIrPct / 100)
export function liquidoGenial(g: { receita: number; lotes: number; incentivo: number; parteParceiro: number }, r: Regua): number {
  return g.receita * fatorGenial(r) + g.incentivo - g.lotes * r.genialPlataformaLote - g.parteParceiro
}

// BTG: a cadeia do Painel do BTG. Por R$ 1 de receita a corretora paga k de comissão (faixas ou o percentual do
// fechamento do mês); do cliente direto sai a Delta e o imposto; do cliente de parceiro com participação sai o
// imposto, a parte do parceiro e a de terceiros (o escritório fica com pctEscritorio % do que sobra)
export type FatoresBtg = { direto: number; parceiros: Record<string, number> }
export function fatoresBtg(k: number, cfg: { deltaPct: number; impostoPct: number; parceiros: { nome: string; pctParceiro: number; pctEscritorio: number }[] }): FatoresBtg {
  const semImposto = k * (1 - cfg.impostoPct / 100)
  return {
    direto: k * (1 - cfg.deltaPct / 100) * (1 - cfg.impostoPct / 100),
    parceiros: Object.fromEntries(cfg.parceiros.map(p => [p.nome, semImposto * (1 - p.pctParceiro / 100) * (p.pctEscritorio / 100)])),
  }
}

// ── Base ativa ─────────────────────────────────────────────────────────────────
// Dono de cada conta até um dia: quem fez o último movimento. No mesmo dia, ativação ou reativação vale mais
// que abertura; empate de mesmo tipo fica com quem veio primeiro (ordem dos nomes).
export type Dono = { pessoa: string; data: string; tipo: TipoEvento; nome: string }
export function donosDaBase(eventos: EventoComissao[], ateDia: string): Map<string, Dono> {
  const ordem = [...eventos].filter(e => e.data <= ateDia).sort((a, b) => a.pessoa.localeCompare(b.pessoa, 'pt-BR') || a.data.localeCompare(b.data))
  const donos = new Map<string, Dono>()
  for (const e of ordem) {
    const k = chaveConta(e.cliente_id, e.corretora)
    const atual = donos.get(k)
    const ganha = !atual || e.data > atual.data || (e.data === atual.data && atual.tipo === 'abertura' && e.tipo !== 'abertura')
    if (ganha) donos.set(k, { pessoa: e.pessoa, data: e.data, tipo: e.tipo, nome: e.nome })
  }
  return donos
}

export type ItemBase = { cliente_id: string; nome: string; corretora: string; ultimoMovimento: string; tipoMovimento: TipoEvento; liquido: number; cheio: boolean }

// A base ativa de uma pessoa no mês: as contas dela (último movimento até o fim do mês) que giraram no mês
export function baseDoMes(pessoa: string, mes: string, donos: Map<string, Dono>, liquido: ReadonlyMap<string, number>, regua: Regua): ItemBase[] {
  const out: ItemBase[] = []
  for (const [k, d] of donos) {
    if (d.pessoa !== pessoa) continue
    const [cliente_id, corretora] = k.split('|')
    const v = liquido.get(chaveMes(cliente_id, corretora, mes))
    if (v == null) continue
    out.push({ cliente_id, nome: d.nome, corretora, ultimoMovimento: d.data, tipoMovimento: d.tipo, liquido: v, cheio: mesesEntre(mesDoDia(d.data), mes) < regua.mesesBonusCheio })
  }
  return out.sort((a, b) => b.liquido - a.liquido || a.nome.localeCompare(b.nome, 'pt-BR'))
}

// ── Pontos ─────────────────────────────────────────────────────────────────────
export type PontosMes = {
  total: number
  ativacoes: number; reativacoes: number; aberturas: number   // quantidade de eventos no mês
  pontosEventos: number; pontosBase: number                   // de onde vieram os pontos
  liquidoBase: number
  porCorretora: Record<string, number>
}
export function pontosDoMes(eventosDoMes: EventoComissao[], base: ItemBase[], regua: Regua): PontosMes {
  const porCorretora: Record<string, number> = {}
  const soma = (cor: string, v: number) => { porCorretora[cor] = (porCorretora[cor] ?? 0) + v }
  let pontosEventos = 0
  for (const e of eventosDoMes) {
    const p = e.tipo === 'ativacao' ? regua.pontosAtivacao[e.corretora] ?? 1 : e.tipo === 'reativacao' ? regua.pontosReativacao : regua.pontosAbertura
    pontosEventos += p
    soma(e.corretora, p)
  }
  let liquidoBase = 0
  for (const b of base) { liquidoBase += b.liquido; soma(b.corretora, b.liquido / regua.reaisPorPonto) }
  const pontosBase = liquidoBase / regua.reaisPorPonto
  return {
    total: pontosEventos + pontosBase,
    ativacoes: eventosDoMes.filter(e => e.tipo === 'ativacao').length,
    reativacoes: eventosDoMes.filter(e => e.tipo === 'reativacao').length,
    aberturas: eventosDoMes.filter(e => e.tipo === 'abertura').length,
    pontosEventos, pontosBase, liquidoBase, porCorretora,
  }
}

// ── Nível ──────────────────────────────────────────────────────────────────────
export type InfoNivel = {
  nivel: number
  media: number             // média de pontos da última revisão
  revisao: string           // mês da última revisão
  mesesMedia: string[]      // meses que entraram na média
  proximaRevisao: string
  abaixo: number            // revisões seguidas abaixo do nível (na 2ª o nível desce)
  primeira: boolean         // a revisão é a da entrada no modelo
}
// Os níveis de uma pessoa mês a mês, de nivelDesde até `ate`. `pontos(mes)` dá os pontos de um mês fechado.
export function niveisDaPessoa(p: PessoaModelo, pontos: (mes: string) => number, tabelas: TabelaNiveis[], reguas: Regua[], ate: string): Map<string, InfoNivel> {
  const out = new Map<string, InfoNivel>()
  let atual = 0, abaixo = 0, primeira = true
  for (let q = p.nivelDesde; q <= ate;) {
    const regua = vigente(reguas, q) ?? REGUA_PADRAO
    const tabela = vigente(tabelas, q) ?? NIVEIS_PADRAO
    const passo = Math.max(1, regua.mesesRevisao)
    const mesesMedia = [3, 2, 1].map(i => somarMeses(q, -i)).filter(m => !p.trabalhaDesde || m >= mesDoDia(p.trabalhaDesde))
    const media = mesesMedia.length ? mesesMedia.reduce((s, m) => s + pontos(m), 0) / mesesMedia.length : 0
    const alcancado = nivelDaMedia(tabela, media).nivel
    if (primeira || alcancado > atual) { atual = alcancado; abaixo = 0 }
    else if (alcancado < atual) { abaixo += 1; if (abaixo >= 2) { atual = alcancado; abaixo = 0 } }
    else abaixo = 0
    const proxima = somarMeses(q, passo)
    for (let m = q; m < proxima && m <= ate; m = somarMeses(m, 1)) out.set(m, { nivel: atual, media, revisao: q, mesesMedia, proximaRevisao: proxima, abaixo, primeira })
    primeira = false
    q = proxima
  }
  return out
}

// ── O valor do mês ─────────────────────────────────────────────────────────────
export type TipoLinha = 'fixo' | 'abertura' | 'ativacao' | 'reativacao' | 'permanencia' | 'bonusCheio' | 'bonusMetade' | 'regraPorConta'
export type LinhaValor = { tipo: TipoLinha; quantidade: number; unitario: number; total: number }
export type ValorCorretora = { fixo: number; variavel: number; total: number; pontos: number }
export type ValorMes = { linhas: LinhaValor[]; fixo: number; variavel: number; total: number; porCorretora: Record<string, ValorCorretora> }

export const ROTULO_LINHA: Record<TipoLinha, string> = {
  fixo: 'Fixo do nível', abertura: 'Contas abertas', ativacao: 'Ativações', reativacao: 'Reativações (quando volta)',
  permanencia: 'Reativações que seguem girando (3 meses depois)', bonusCheio: 'Bônus da base no 1º ano', bonusMetade: 'Bônus da base depois do 1º ano',
  regraPorConta: 'Comissão por conta (regra de antes do modelo)',
}

// O valor de um mês no modelo. O fixo se divide entre as corretoras pelos pontos do mês em cada uma (sem pontos,
// fica na Genial); eventos e bônus contam onde aconteceram.
export function valorDoMes(nivel: Nivel, eventosDoMes: EventoComissao[], permanencias: EventoComissao[], base: ItemBase[], pontosPorCorretora: Record<string, number>): ValorMes {
  const porCorretora: Record<string, ValorCorretora> = {}
  const cor = (c: string) => (porCorretora[c] ??= { fixo: 0, variavel: 0, total: 0, pontos: round2(pontosPorCorretora[c] ?? 0) })
  const somaVar = (c: string, v: number) => { cor(c).variavel += v }
  for (const e of eventosDoMes) somaVar(e.corretora, e.tipo === 'abertura' ? nivel.abertura : e.tipo === 'ativacao' ? nivel.ativacao : nivel.reativacaoVolta)
  for (const e of permanencias) somaVar(e.corretora, nivel.reativacao3Meses)
  for (const b of base) somaVar(b.corretora, b.liquido * (b.cheio ? nivel.bonus1Ano : nivel.bonusDepois))
  const pontosTotal = Object.values(pontosPorCorretora).reduce((s, v) => s + Math.max(0, v), 0)
  if (pontosTotal > 0) for (const [c, v] of Object.entries(pontosPorCorretora)) { if (v > 0) cor(c).fixo += (nivel.fixo * v) / pontosTotal }
  else cor('GENIAL').fixo += nivel.fixo
  for (const v of Object.values(porCorretora)) { v.fixo = round2(v.fixo); v.variavel = round2(v.variavel); v.total = round2(v.fixo + v.variavel) }

  const conta = (tipo: TipoEvento) => eventosDoMes.filter(e => e.tipo === tipo).length
  const cheio = base.filter(b => b.cheio).reduce((s, b) => s + b.liquido, 0)
  const metade = base.filter(b => !b.cheio).reduce((s, b) => s + b.liquido, 0)
  const linhas: LinhaValor[] = [
    { tipo: 'fixo', quantidade: 1, unitario: nivel.fixo, total: nivel.fixo },
    { tipo: 'abertura', quantidade: conta('abertura'), unitario: nivel.abertura, total: round2(conta('abertura') * nivel.abertura) },
    { tipo: 'ativacao', quantidade: conta('ativacao'), unitario: nivel.ativacao, total: round2(conta('ativacao') * nivel.ativacao) },
    { tipo: 'reativacao', quantidade: conta('reativacao'), unitario: nivel.reativacaoVolta, total: round2(conta('reativacao') * nivel.reativacaoVolta) },
    { tipo: 'permanencia', quantidade: permanencias.length, unitario: nivel.reativacao3Meses, total: round2(permanencias.length * nivel.reativacao3Meses) },
    { tipo: 'bonusCheio', quantidade: round2(cheio), unitario: nivel.bonus1Ano, total: round2(cheio * nivel.bonus1Ano) },
    { tipo: 'bonusMetade', quantidade: round2(metade), unitario: nivel.bonusDepois, total: round2(metade * nivel.bonusDepois) },
  ]
  const fixo = nivel.fixo
  const total = round2(Object.values(porCorretora).reduce((s, v) => s + v.total, 0))
  return { linhas, fixo, variavel: round2(total - fixo), total, porCorretora }
}

// As reativações de `mesesPermanencia` meses antes, feitas já no modelo, cujo cliente gira no mês
export function permanenciasDoMes(eventos: EventoComissao[], pessoa: string, mes: string, nivelDesde: string, girou: ReadonlySet<string>, regua: Regua): EventoComissao[] {
  const origem = somarMeses(mes, -regua.mesesPermanencia)
  if (origem < nivelDesde) return []
  return eventos.filter(e => e.pessoa === pessoa && e.tipo === 'reativacao' && e.mes_ref === origem && girou.has(chaveMes(e.cliente_id, e.corretora, mes)))
}

// ── A conta de uma pessoa, mês a mês ───────────────────────────────────────────
export type ContaMes = {
  pessoa: string
  mes: string
  noModelo: boolean
  nivel: InfoNivel | null
  valores: Nivel | null       // os valores do nível no mês
  pontos: PontosMes
  eventos: EventoComissao[]   // do mês (no modelo, o valor de cada um é o do nível)
  permanencias: EventoComissao[]
  base: ItemBase[]
  valor: ValorMes
}

export type DadosRemuneracao = {
  pessoas: PessoaModelo[]
  tabelas: TabelaNiveis[]
  reguas: Regua[]
  eventos: EventoComissao[]                // de todas as pessoas, toda a história
  liquido: ReadonlyMap<string, number>     // chaveMes → líquido do escritório (só quem girou)
  girou: ReadonlySet<string>               // chaveMes de quem girou (lotes > 0)
}

const ultimoDia = (mes: string) => { const prox = somarMeses(mes, 1); const d = new Date(`${prox}T12:00:00Z`); d.setUTCDate(0); return d.toISOString().slice(0, 10) }

// A conta de cada mês de `meses` para uma pessoa (no modelo ou não). Os pontos dos meses que entram nas médias
// são calculados do mesmo jeito, mesmo antes do modelo.
export function contaDaPessoa(nome: string, meses: string[], d: DadosRemuneracao): ContaMes[] {
  const pessoa = d.pessoas.find(p => p.nome === nome) ?? null
  const cacheDonos = new Map<string, Map<string, Dono>>()
  const donosAte = (mes: string) => { let x = cacheDonos.get(mes); if (!x) { x = donosDaBase(d.eventos, ultimoDia(mes)); cacheDonos.set(mes, x) } return x }
  const doMes = (mes: string) => d.eventos.filter(e => e.pessoa === nome && e.mes_ref === mes)
  const reguaDe = (mes: string) => vigente(d.reguas, mes) ?? REGUA_PADRAO
  const cachePontos = new Map<string, PontosMes>()
  const pontosDe = (mes: string) => {
    let x = cachePontos.get(mes)
    if (!x) { const r = reguaDe(mes); x = pontosDoMes(doMes(mes), baseDoMes(nome, mes, donosAte(mes), d.liquido, r), r); cachePontos.set(mes, x) }
    return x
  }
  const ate = [...meses].sort().at(-1) ?? ''
  const niveis = pessoa ? niveisDaPessoa(pessoa, m => pontosDe(m).total, d.tabelas, d.reguas, ate) : new Map<string, InfoNivel>()
  return meses.map(mes => {
    const regua = reguaDe(mes)
    const eventos = doMes(mes)
    const base = baseDoMes(nome, mes, donosAte(mes), d.liquido, regua)
    const pontos = pontosDe(mes)
    const nivel = niveis.get(mes) ?? null
    if (!pessoa || !nivel || mes < pessoa.nivelDesde) {
      // antes do modelo: a comissão por conta de sempre
      const total = round2(eventos.reduce((s, e) => s + e.valor, 0))
      const porCorretora: Record<string, ValorCorretora> = {}
      for (const e of eventos) { const c = (porCorretora[e.corretora] ??= { fixo: 0, variavel: 0, total: 0, pontos: 0 }); c.variavel = round2(c.variavel + e.valor); c.total = c.variavel }
      return { pessoa: nome, mes, noModelo: false, nivel: null, valores: null, pontos, eventos, permanencias: [], base, valor: { linhas: [{ tipo: 'regraPorConta', quantidade: eventos.length, unitario: 0, total }], fixo: 0, variavel: total, total, porCorretora } }
    }
    const valores = nivelDaTabela(vigente(d.tabelas, mes) ?? NIVEIS_PADRAO, nivel.nivel)
    const permanencias = permanenciasDoMes(d.eventos, nome, mes, pessoa.nivelDesde, d.girou, regua)
    const eventosNoNivel = eventos.map(e => ({ ...e, valor: e.tipo === 'abertura' ? valores.abertura : e.tipo === 'ativacao' ? valores.ativacao : valores.reativacaoVolta }))
    return { pessoa: nome, mes, noModelo: true, nivel, valores, pontos, eventos: eventosNoNivel, permanencias, base, valor: valorDoMes(valores, eventos, permanencias, base, pontos.porCorretora) }
  })
}

// O valor dentro do filtro de corretora (null = todas)
export const valorNaCorretora = (c: ContaMes, corretora: string | null): number => (corretora ? c.valor.porCorretora[corretora]?.total ?? 0 : c.valor.total)

// Quantos pontos por mês faltam para o próximo nível (null no último)
export function faltaParaSubir(tabela: TabelaNiveis, nivel: number, media: number): { proximo: Nivel; faltam: number } | null {
  const proximo = [...tabela.niveis].sort((a, b) => a.nivel - b.nivel).find(n => n.nivel > nivel)
  return proximo ? { proximo, faltam: Math.max(0, proximo.pontosMin - media) } : null
}
