// Participação de parceiros na receita (parâmetro parceiros_receita): as leituras do banco.
// Só servidor (páginas). O cálculo e o formato da regra ficam em participacao.ts. No fim, a parte de um
// parceiro na comissão do BTG (repasse_parceiros), para a página dele em Comissões.
//
// Não há função no banco para isto: os lançamentos dos códigos do parceiro saem direto da tabela lotes
// (poucas centenas de linhas por mês) e são medidos com a mesma conta do resumo mensal; o incentivo de
// cada cliente vem de incentivo_mes, a mesma função da tela Incentivo, uma chamada por mês com lançamento.
import type { Corretora } from '@/lib/corretoras'
import { normTexto } from '@/lib/texto'
import { equipe, falha, num, str } from './guard'
import { comissaoCarteiraMes, comissaoMensal, incentivoMes, painelMensal, todasAsLinhas, ultimaData } from './consultas'
import { calcularRepasse, configBtg, type ParceiroRepasse } from './btg'
import {
  CHAVE_PARCEIROS_RECEITA, lerParceirosReceita, medirBaseBtg, medirLote, receitaDoMes, regraDoMes, regrasComFichas, regrasDoParceiro, repassePorMes,
  type BaseBtgMes, type FichasDoMes, type LoteMedido, type MedidaBtg, type MesReceita, type MesRepasseBtg, type RegraReceita,
} from './participacao'
import { listaComReceita, listaDaCorretora, type ListaComReceita } from './consultasParceirosCliente'
import { listaDoMes } from './parceirosCliente'
import { mesAtual, somarMeses } from './meses'
import type { Parametro } from './tipos'

type Row = Record<string, unknown>

export type RegrasCorretora = { corretora: Corretora; regras: RegraReceita[] }

// A corretora em que o parceiro recebe pela cadeia do fechamento (comissão do BTG), não sobre a receita
const CORRETORA_DO_REPASSE: Corretora = 'BTG'

// As regras de participação na receita das corretoras pedidas (só as corretoras que têm alguma). Quem está
// na lista de parceiros de alguma ficha (S61) entra também, com uma regra só-ficha, mesmo sem regra no
// parâmetro; no BTG a lista segue a cadeia da comissão, não esta conta.
export async function regrasReceita(corretoras: Corretora[]): Promise<RegrasCorretora[]> {
  if (!corretoras.length) return []
  const { db } = await equipe()
  const [{ data, error }, listas] = await Promise.all([
    db.from('parametros').select('corretora, valor').eq('chave', CHAVE_PARCEIROS_RECEITA).in('corretora', corretoras),
    Promise.all(corretoras.map(c => (c === CORRETORA_DO_REPASSE ? Promise.resolve([]) : listaDaCorretora(c)))),
  ])
  if (error) falha(error, 'parametros')
  const linhas = (data ?? []) as Row[]
  return corretoras
    .map((c, i) => ({ corretora: c, regras: regrasComFichas(lerParceirosReceita(str(linhas.find(r => r.corretora === c)?.valor)), listas[i]) }))
    .filter(x => x.regras.length > 0)
}

// As regras de um parceiro, por corretora (só as corretoras em que ele tem regra)
export const regrasDoParceiroPorCorretora = (regras: RegrasCorretora[], parceiro: string): RegrasCorretora[] =>
  regras.map(r => ({ corretora: r.corretora, regras: regrasDoParceiro(r.regras, parceiro) })).filter(r => r.regras.length > 0)

export type ParticipacaoReceita = {
  parceiro: string
  corretora: Corretora
  regras: RegraReceita[]      // as do parceiro nesta corretora, da mais antiga para a mais nova
  assessores: string[]        // códigos de assessor ligados ao parceiro (Parâmetros › Assessores)
  clientes: number            // clientes cadastrados nesses códigos
  clientesFicha: number       // clientes em que ele está na lista de parceiros da ficha neste mês (S61)
  meses: MesReceita[]         // um por mês com lançamento desde o início da regra, em ordem
  ultimaData: string | null   // último dia lançado na corretora
}

const COLUNAS_LOTE = 'data, chave_incentivo, cliente_id, conta, nome_cliente, qtd, tarifa, zeragem_rs, multiplicador, zeragem, posicao, acoes'
const LOTE_DE_IDS = 100

// Os lançamentos medidos, separados por mês
function lotesPorMes(brutos: Row[]): Map<string, LoteMedido[]> {
  const porMes = new Map<string, LoteMedido[]>()
  for (const r of brutos) {
    const l = medirLote({
      data: String(r.data), chave_incentivo: str(r.chave_incentivo), cliente_id: str(r.cliente_id), conta: str(r.conta), nome_cliente: str(r.nome_cliente),
      qtd: num(r.qtd), tarifa: num(r.tarifa), zeragem_rs: num(r.zeragem_rs), multiplicador: num(r.multiplicador),
      zeragem: r.zeragem === true, posicao: r.posicao === true, acoes: r.acoes === true,
    })
    const lista = porMes.get(l.mes)
    if (lista) lista.push(l); else porMes.set(l.mes, [l])
  }
  return porMes
}

// Tudo o que o parceiro gerou numa corretora desde o início da regra dele, mês a mês e cliente a cliente:
// pelos códigos de assessor dele (regra geral) e pelos clientes em que ele está na lista de parceiros da
// ficha (S61), com o percentual da linha dele, em qualquer código. Cliente com lista sai da regra geral.
export async function participacaoReceita(corretora: Corretora, regrasDaCorretora: RegraReceita[], parceiro: string): Promise<ParticipacaoReceita> {
  const { db } = await equipe()
  const regras = regrasDoParceiro(regrasDaCorretora, parceiro)
  const base: ParticipacaoReceita = { parceiro, corretora, regras, assessores: [], clientes: 0, clientesFicha: 0, meses: [], ultimaData: null }
  if (!regras.length) return base

  const ultimaP = ultimaData(corretora)
  const gerais = regras.filter(r => !r.soFicha)   // as do parâmetro: valem para os códigos de assessor
  const [assessores, lista] = await Promise.all([
    gerais.length ? db.from('assessores').select('nome, nome_norm, parceiro').eq('corretora', corretora).not('parceiro', 'is', null) : Promise.resolve({ data: [] as Row[], error: null }),
    corretora === CORRETORA_DO_REPASSE ? Promise.resolve([]) : listaDaCorretora(corretora),
  ])
  if (assessores.error) falha(assessores.error, 'assessores')
  const meus = ((assessores.data ?? []) as Row[]).filter(a => normTexto(String(a.parceiro ?? '')) === normTexto(parceiro))
  const minhas = lista.filter(l => normTexto(l.parceiro) === normTexto(parceiro))
  if (!meus.length && !minhas.length) return { ...base, ultimaData: await ultimaP }
  const codigos = meus.map(a => String(a.nome_norm))
  const idsFicha = [...new Set(minhas.map(l => l.cliente_id))]
  const inicioFicha = minhas.map(l => l.desde).sort()[0]
  const partes = Array.from({ length: Math.ceil(idsFicha.length / LOTE_DE_IDS) }, (_, i) => idsFicha.slice(i * LOTE_DE_IDS, (i + 1) * LOTE_DE_IDS))

  const [brutos, contas, ultima, brutosFicha] = await Promise.all([
    codigos.length
      ? todasAsLinhas<Row>((de, ate) => db.from('lotes').select(COLUNAS_LOTE).eq('corretora', corretora).in('assessor_norm', codigos)
        .eq('conta_para_receita', true).gte('data', gerais[0].desde).order('id').range(de, ate), 'lotes')
      : Promise.resolve<Row[]>([]),
    codigos.length ? db.from('contas').select('cliente_id').eq('corretora', corretora).in('assessor_norm', codigos).range(0, 9999) : Promise.resolve({ data: [] as Row[], error: null }),
    ultimaP,
    // os clientes da lista, em qualquer código nosso
    Promise.all(partes.map(ids => todasAsLinhas<Row>((de, ate) => db.from('lotes').select(COLUNAS_LOTE).eq('corretora', corretora).in('cliente_id', ids)
      .eq('conta_para_receita', true).gte('data', inicioFicha).order('id').range(de, ate), 'lotes'))),
  ])
  if (contas.error) falha(contas.error, 'contas')

  const porMes = lotesPorMes(brutos), porMesFicha = lotesPorMes(brutosFicha.flat())
  const meses = await Promise.all([...new Set([...porMes.keys(), ...porMesFicha.keys()])].sort().map(async mes => {
    const regra = regraDoMes(regras, mes)
    if (!regra) return null
    const doMes = lista.length ? listaDoMes(lista, mes, parceiro) : null
    const fichas: FichasDoMes | null = doMes && doMes.comLista.size ? { comLista: doMes.comLista, doParceiro: doMes.doParceiro, lotes: porMesFicha.get(mes) ?? [] } : null
    // o mês entra quando há lançamento nos códigos (regra geral) ou de algum cliente em que ele está na lista
    const peloCodigo = !regra.soFicha && porMes.has(mes)
    const pelaFicha = !!fichas && fichas.lotes.some(l => !!l.cliente_id && fichas.doParceiro.has(l.cliente_id))
    if (!peloCodigo && !pelaFicha) return null
    return receitaDoMes(mes, porMes.get(mes) ?? [], await incentivoMes(corretora, mes), regra, fichas)
  }))

  return {
    ...base, assessores: meus.map(a => String(a.nome)).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    clientes: new Set(((contas.data ?? []) as Row[]).map(c => str(c.cliente_id)).filter(Boolean)).size,
    clientesFicha: lista.length ? listaDoMes(lista, mesAtual(), parceiro).doParceiro.size : 0,
    meses: meses.filter((m): m is MesReceita => m != null), ultimaData: ultima,
  }
}

// ── Participação na comissão do BTG (parâmetro repasse_parceiros) ──────────────
// No BTG o parceiro segue a cadeia do fechamento, como a Atual Capital: a comissão que o BTG paga sobre os
// clientes dele (os que têm o nome dele no campo Parceiro da ficha) paga o imposto do escritório, o parceiro
// leva a parte dele e o escritório fica com a sua parte do restante. Lucas, 16/11/2026, sobre o Fabio Ferron:
// "BTG: corretagem | zeragem | igual foi com a Atual Capital mês passado".
async function configDoBtg() {
  const { db } = await equipe()
  const { data, error } = await db.from('parametros').select('chave, valor, descricao').eq('corretora', 'BTG')
  if (error) falha(error, 'parametros')
  return configBtg(((data ?? []) as Row[]).map<Parametro>(r => ({ chave: String(r.chave), valor: String(r.valor ?? ''), descricao: str(r.descricao) })))
}

// Os parceiros com participação na comissão do BTG e os percentuais de cada um
export async function repasseBtg(): Promise<ParceiroRepasse[]> {
  return (await configDoBtg()).parceiros
}

export type ParticipacaoBtg = {
  regra: ParceiroRepasse
  impostoPct: number         // imposto do escritório sobre a comissão
  pctComissao: number        // % de comissão do BTG no mês: o do fechamento, quando registrado; senão o efetivo pelas faixas
  fechado: boolean           // o mês já tem o percentual do fechamento
  contas: number             // contas do BTG na carteira do parceiro (com as que entram só pela lista da ficha)
  receita: number            // receita (corretagem e zeragem) dos clientes dele no mês
  comissao: number           // comissão do BTG sobre eles
  imposto: number
  parte: number              // o que vai para o parceiro
  comFicha: boolean          // algum cliente do mês entra pela lista de parceiros da ficha, com percentual próprio (S61)
  // quem gerou receita no mês; pctFicha = o percentual dele naquele cliente, quando vem da lista da ficha
  clientes: { cliente_id: string; nome: string; lotes: number; receita: number; parte: number; pctFicha: number | null }[]
  // contas dele que giraram no mês mas ainda não estão como migradas na ficha: a receita delas fica fora da
  // conta (aqui e no Painel do BTG) até a situação da ficha ser corrigida
  foraDaConta: { cliente_id: string; nome: string; situacao: string; receita: number }[]
}

// Situação da conta que entra na divisão: a mesma de comissao_mensal.receita_carteira (a fonte do Painel)
const CONTA_QUE_CONTA = 'Migrado'
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

// A base de um parceiro no BTG num mês, com as listas das fichas (S61). Da receita da carteira dele (os
// clientes de sempre: campo Parceiro da ficha, lead etc., a de comissao_mensal) sai quem tem lista em vigor
// no mês, e entram, com o percentual da linha, os clientes em que ele está na lista. Como nos clientes sem
// lista, só conta a ficha com a situação Migrado.
function baseBtgDoMes(lista: ListaComReceita, parceiro: string, naCarteira: ReadonlySet<string>, carteira: number, mes: string): BaseBtgMes {
  const doMes = listaDoMes(lista.linhas, mes, parceiro)
  let padrao = carteira
  const fichas: BaseBtgMes['fichas'] = []
  for (const id of doMes.comLista) {
    if (lista.clientes.get(id)?.status !== CONTA_QUE_CONTA) continue
    const receita = lista.receita.get(id)?.get(mes)?.receita ?? 0
    if (receita <= 0) continue
    if (naCarteira.has(id)) padrao -= receita
    const pct = doMes.doParceiro.get(id)
    if (pct) fichas.push({ receita, pct, soma: doMes.soma.get(id) ?? pct })
  }
  return { padrao: Math.max(0, round2(padrao)), fichas }
}

// Quem está na carteira do parceiro pelos critérios de sempre e com a situação Migrado: os clientes cuja
// receita comissao_mensal soma em receita_carteira
async function carteiraMigrada(corretora: Corretora, parceiro: string, mesRef: string): Promise<Set<string>> {
  const carteira = await comissaoCarteiraMes(parceiro, corretora, mesRef)
  return new Set(carteira.filter(c => c.status === CONTA_QUE_CONTA).map(c => c.cliente_id))
}

// A parte de um parceiro no BTG num mês, com a mesma conta do Painel do BTG e da visão geral de Comissões
// (calcularRepasse sobre a receita do mês); null quando ele não está em repasse_parceiros. A cadeia é
// proporcional à receita, então a parte por cliente segue a receita de cada um (e, quando há cliente com
// lista de parceiros na ficha, a receita vezes o percentual dele naquele cliente).
// `desde` = primeiro mês que conta para os clientes sem lista (quem também tem regra de participação na
// receita só conta o BTG a partir dela); antes dele só entra o cliente com lista de parceiros na ficha.
export async function participacaoBtg(parceiro: string, mesRef: string, desde: string | null = null): Promise<ParticipacaoBtg | null> {
  const cfg = await configDoBtg()
  const regra = cfg.parceiros.find(p => normTexto(p.nome) === normTexto(parceiro))
  if (!regra) return null
  const [mensal, livro, carteira, lista] = await Promise.all([
    painelMensal('BTG', mesRef, 1), comissaoMensal(mesRef, 1, regra.nome, 'BTG'), comissaoCarteiraMes(regra.nome, 'BTG', mesRef), listaComReceita(CORRETORA_DO_REPASSE),
  ])
  const receitaBtg = mensal.find(m => m.mes_ref === mesRef)?.receita ?? 0
  const dele = livro.find(x => x.mes_ref === mesRef)?.receita_carteira ?? 0
  const doMes = lista ? listaDoMes(lista.linhas, mesRef, regra.nome) : null
  const naCarteira = new Set(carteira.filter(c => c.status === CONTA_QUE_CONTA).map(c => c.cliente_id))
  const antes = !!desde && mesRef < desde
  const cheio: BaseBtgMes = lista ? baseBtgDoMes(lista, regra.nome, naCarteira, dele, mesRef) : { padrao: dele, fichas: [] }
  const m = medirBaseBtg(antes ? { ...cheio, padrao: 0 } : cheio, regra.pctParceiro)
  const r = calcularRepasse(receitaBtg, cfg, mesRef, { [regra.nome]: m.alocada }, { [regra.nome]: m.pct })
  const p = r.parceiros.find(x => x.nome === regra.nome)
  // na página dele a receita e a comissão são as dos clientes dele por inteiro (cliente dividido com outro
  // parceiro entra só em parte no livro dele na cadeia)
  const cheia = m.alocada > 0 ? m.receita / m.alocada : 1

  // quem gerou receita no mês: os da carteira de sempre e os que entram só pela lista da ficha
  type Linha = { cliente_id: string; nome: string; lotes: number; receita: number; situacao: string; pct: number; pctFicha: number | null }
  const linhas: Linha[] = []
  const vistos = new Set<string>()
  for (const c of carteira) {
    vistos.add(c.cliente_id)
    if (c.receita_mes <= 0) continue
    const pctFicha = doMes?.comLista.has(c.cliente_id) ? doMes.doParceiro.get(c.cliente_id) ?? 0 : null
    if (pctFicha === 0) continue   // o cliente tem lista no mês e este parceiro não está nela: vale a lista
    if (antes && pctFicha == null) continue
    linhas.push({ cliente_id: c.cliente_id, nome: c.nome, lotes: c.lotes_mes, receita: c.receita_mes, situacao: c.status, pct: pctFicha ?? regra.pctParceiro, pctFicha })
  }
  let soPelaFicha = 0
  if (lista && doMes) {
    for (const [id, pct] of doMes.doParceiro) {
      if (vistos.has(id)) continue
      soPelaFicha++
      const x = lista.receita.get(id)?.get(mesRef), cli = lista.clientes.get(id)
      if (!x || x.receita <= 0) continue
      linhas.push({ cliente_id: id, nome: cli?.nome ?? 'Cliente', lotes: x.lotes, receita: x.receita, situacao: cli?.status ?? '', pct, pctFicha: pct })
    }
  }
  const naConta = linhas.filter(c => c.situacao === CONTA_QUE_CONTA)
  const comFicha = naConta.some(c => c.pctFicha != null)
  const pesoDe = (c: Linha) => (comFicha ? c.receita * c.pct : c.receita)
  const soma = naConta.reduce((s, c) => s + pesoDe(c), 0)
  return {
    regra, impostoPct: cfg.impostoPct, pctComissao: r.pctEfetivo, fechado: cfg.pctMes[mesRef.slice(0, 7)] != null, contas: carteira.length + soPelaFicha,
    receita: (p?.receita ?? 0) * cheia, comissao: (p?.comissao ?? 0) * cheia, imposto: (p?.imposto ?? 0) * cheia, parte: p?.parceiro ?? 0, comFicha,
    clientes: naConta.map(c => ({ cliente_id: c.cliente_id, nome: c.nome, lotes: c.lotes, receita: c.receita, parte: soma > 0 ? Math.round(((p?.parceiro ?? 0) * pesoDe(c) / soma) * 100) / 100 : 0, pctFicha: c.pctFicha })),
    foraDaConta: linhas.filter(c => c.situacao !== CONTA_QUE_CONTA).map(c => ({ cliente_id: c.cliente_id, nome: c.nome, situacao: c.situacao, receita: c.receita })),
  }
}

export type RepasseBtgDoParceiro = {
  regra: ParceiroRepasse
  impostoPct: number
  meses: MesRepasseBtg[]   // os meses em que os clientes dele geraram receita no BTG, em ordem
}

const JANELA_REPASSE_BTG = 36   // meses para trás, a partir do mês corrente

// Receita do BTG inteiro por mês ('AAAA-MM-01' → R$), na janela até `fim`: a base das faixas de comissão
async function receitaMensalDoBtg(fim: string): Promise<Record<string, number>> {
  const mensal = await painelMensal('BTG', fim, JANELA_REPASSE_BTG)
  return Object.fromEntries(mensal.map(m => [m.mes_ref, m.receita]))
}

type ConfigDoBtg = Awaited<ReturnType<typeof configDoBtg>>

async function livroBtgDoParceiro(cfg: ConfigDoBtg, regra: ParceiroRepasse, receitaBtg: Record<string, number>, fim: string, desde: string | null): Promise<RepasseBtgDoParceiro> {
  const [livro, lista] = await Promise.all([comissaoMensal(fim, JANELA_REPASSE_BTG, regra.nome, 'BTG'), listaComReceita(CORRETORA_DO_REPASSE)])
  const dele: Record<string, number> = {}
  for (const l of livro) dele[l.mes_ref] = (dele[l.mes_ref] ?? 0) + l.receita_carteira
  // nenhuma ficha com lista de parceiros: a conta de sempre
  if (!lista) return { regra, impostoPct: cfg.impostoPct, meses: repassePorMes(cfg, regra.nome, receitaBtg, dele, desde) }
  const naCarteira = await carteiraMigrada(CORRETORA_DO_REPASSE, regra.nome, fim)
  const bases: Record<string, BaseBtgMes> = {}
  for (let i = 0; i < JANELA_REPASSE_BTG; i++) { const mes = somarMeses(fim, -i); bases[mes] = baseBtgDoMes(lista, regra.nome, naCarteira, dele[mes] ?? 0, mes) }
  return { regra, impostoPct: cfg.impostoPct, meses: repassePorMes(cfg, regra.nome, receitaBtg, bases, desde) }
}

// A parte do parceiro na comissão do BTG mês a mês, até o mês corrente: é o que entra no "gerado" e no
// saldo a pagar dele. `desde` ('AAAA-MM-01') limita o começo: quem também tem regra de participação na
// receita (parceiros_receita) só conta o BTG a partir do início dessa regra (o cliente com lista de
// parceiros na ficha conta desde o começo da linha dele).
export async function repasseBtgMensal(parceiro: string, desde: string | null = null): Promise<RepasseBtgDoParceiro | null> {
  const cfg = await configDoBtg()
  const regra = cfg.parceiros.find(p => normTexto(p.nome) === normTexto(parceiro))
  if (!regra) return null
  const fim = mesAtual()
  return livroBtgDoParceiro(cfg, regra, await receitaMensalDoBtg(fim), fim, desde)
}

// O mesmo para todos os parceiros do repasse de uma vez (visão geral de Comissões): a configuração e a
// receita do BTG são lidas uma vez só. `desdeDe` devolve o primeiro mês que conta para cada parceiro.
export async function repasseBtgDeTodos(desdeDe: (nome: string) => string | null = () => null): Promise<RepasseBtgDoParceiro[]> {
  const cfg = await configDoBtg()
  if (!cfg.parceiros.length) return []
  const fim = mesAtual()
  const receitaBtg = await receitaMensalDoBtg(fim)
  return Promise.all(cfg.parceiros.map(p => livroBtgDoParceiro(cfg, p, receitaBtg, fim, desdeDe(p.nome))))
}

// Para o Painel: o livro de cada parceiro do repasse em cada mês da janela (a receita que entra na cadeia
// e o percentual dele), já com as listas das fichas. `carteiras` = a receita mensal da carteira de cada
// parceiro (comissao_mensal), que o Painel já lê. null quando nenhuma ficha tem lista de parceiros: o
// Painel segue a conta de sempre.
export async function livrosComFichas(corretora: Corretora, parceiros: ParceiroRepasse[], carteiras: Record<string, Record<string, number>>, fim: string, meses: number): Promise<Record<string, Record<string, MedidaBtg>> | null> {
  if (!parceiros.length) return null
  const lista = await listaComReceita(corretora)
  if (!lista) return null
  const livros = await Promise.all(parceiros.map(async p => {
    const naCarteira = await carteiraMigrada(corretora, p.nome, fim)
    const porMes: Record<string, MedidaBtg> = {}
    for (let i = 0; i < meses; i++) { const mes = somarMeses(fim, -i); porMes[mes] = medirBaseBtg(baseBtgDoMes(lista, p.nome, naCarteira, carteiras[p.nome]?.[mes] ?? 0, mes), p.pctParceiro) }
    return [p.nome, porMes] as const
  }))
  return Object.fromEntries(livros)
}
