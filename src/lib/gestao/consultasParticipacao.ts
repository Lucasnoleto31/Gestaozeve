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
  CHAVE_PARCEIROS_RECEITA, lerParceirosReceita, medirLote, receitaDoMes, regraDoMes, regrasDoParceiro, repassePorMes,
  type LoteMedido, type MesReceita, type MesRepasseBtg, type RegraReceita,
} from './participacao'
import { mesAtual } from './meses'
import type { Parametro } from './tipos'

type Row = Record<string, unknown>

export type RegrasCorretora = { corretora: Corretora; regras: RegraReceita[] }

// As regras de participação na receita das corretoras pedidas (só as corretoras que têm alguma)
export async function regrasReceita(corretoras: Corretora[]): Promise<RegrasCorretora[]> {
  if (!corretoras.length) return []
  const { db } = await equipe()
  const { data, error } = await db.from('parametros').select('corretora, valor').eq('chave', CHAVE_PARCEIROS_RECEITA).in('corretora', corretoras)
  if (error) falha(error, 'parametros')
  const linhas = (data ?? []) as Row[]
  return corretoras
    .map(c => ({ corretora: c, regras: lerParceirosReceita(str(linhas.find(r => r.corretora === c)?.valor)) }))
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
  meses: MesReceita[]         // um por mês com lançamento desde o início da regra, em ordem
  ultimaData: string | null   // último dia lançado na corretora
}

const COLUNAS_LOTE = 'data, chave_incentivo, cliente_id, conta, nome_cliente, qtd, tarifa, zeragem_rs, multiplicador, zeragem, posicao, acoes'

// Tudo o que o parceiro gerou numa corretora desde o início da regra dele, mês a mês e cliente a cliente
export async function participacaoReceita(corretora: Corretora, regrasDaCorretora: RegraReceita[], parceiro: string): Promise<ParticipacaoReceita> {
  const { db } = await equipe()
  const regras = regrasDoParceiro(regrasDaCorretora, parceiro)
  const base: ParticipacaoReceita = { parceiro, corretora, regras, assessores: [], clientes: 0, meses: [], ultimaData: null }
  if (!regras.length) return base

  const ultimaP = ultimaData(corretora)
  const { data: ass, error } = await db.from('assessores').select('nome, nome_norm, parceiro').eq('corretora', corretora).not('parceiro', 'is', null)
  if (error) falha(error, 'assessores')
  const meus = ((ass ?? []) as Row[]).filter(a => normTexto(String(a.parceiro ?? '')) === normTexto(parceiro))
  if (!meus.length) return { ...base, ultimaData: await ultimaP }
  const codigos = meus.map(a => String(a.nome_norm))

  const [brutos, contas, ultima] = await Promise.all([
    todasAsLinhas<Row>((de, ate) => db.from('lotes').select(COLUNAS_LOTE).eq('corretora', corretora).in('assessor_norm', codigos)
      .eq('conta_para_receita', true).gte('data', regras[0].desde).order('id').range(de, ate), 'lotes'),
    db.from('contas').select('cliente_id').eq('corretora', corretora).in('assessor_norm', codigos).range(0, 9999),
    ultimaP,
  ])
  if (contas.error) falha(contas.error, 'contas')

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
  const meses = await Promise.all([...porMes.keys()].sort().map(async mes => {
    const regra = regraDoMes(regras, mes)
    return regra ? receitaDoMes(mes, porMes.get(mes) ?? [], await incentivoMes(corretora, mes), regra) : null
  }))

  return {
    ...base, assessores: meus.map(a => String(a.nome)).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    clientes: new Set(((contas.data ?? []) as Row[]).map(c => str(c.cliente_id)).filter(Boolean)).size,
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
  contas: number             // contas do BTG na carteira do parceiro
  receita: number            // receita (corretagem e zeragem) dos clientes dele no mês
  comissao: number           // comissão do BTG sobre eles
  imposto: number
  parte: number              // o que vai para o parceiro
  clientes: { cliente_id: string; nome: string; lotes: number; receita: number; parte: number }[]   // quem gerou receita no mês
  // contas dele que giraram no mês mas ainda não estão como migradas na ficha: a receita delas fica fora da
  // conta (aqui e no Painel do BTG) até a situação da ficha ser corrigida
  foraDaConta: { cliente_id: string; nome: string; situacao: string; receita: number }[]
}

// Situação da conta que entra na divisão: a mesma de comissao_mensal.receita_carteira (a fonte do Painel)
const CONTA_QUE_CONTA = 'Migrado'

// A parte de um parceiro no BTG num mês, com a mesma conta do Painel do BTG e da visão geral de Comissões
// (calcularRepasse sobre a receita do mês); null quando ele não está em repasse_parceiros. A cadeia é
// proporcional à receita, então a parte por cliente segue a receita de cada um.
export async function participacaoBtg(parceiro: string, mesRef: string): Promise<ParticipacaoBtg | null> {
  const cfg = await configDoBtg()
  const regra = cfg.parceiros.find(p => normTexto(p.nome) === normTexto(parceiro))
  if (!regra) return null
  const [mensal, livro, carteira] = await Promise.all([painelMensal('BTG', mesRef, 1), comissaoMensal(mesRef, 1, regra.nome, 'BTG'), comissaoCarteiraMes(regra.nome, 'BTG', mesRef)])
  const receitaBtg = mensal.find(m => m.mes_ref === mesRef)?.receita ?? 0
  const dele = livro.find(x => x.mes_ref === mesRef)?.receita_carteira ?? 0
  const r = calcularRepasse(receitaBtg, cfg, mesRef, { [regra.nome]: dele })
  const p = r.parceiros.find(x => x.nome === regra.nome)
  const comReceita = carteira.filter(c => c.receita_mes > 0)
  const naConta = comReceita.filter(c => c.status === CONTA_QUE_CONTA)
  const soma = naConta.reduce((s, c) => s + c.receita_mes, 0)
  return {
    regra, impostoPct: cfg.impostoPct, pctComissao: r.pctEfetivo, fechado: cfg.pctMes[mesRef.slice(0, 7)] != null, contas: carteira.length,
    receita: p?.receita ?? 0, comissao: p?.comissao ?? 0, imposto: p?.imposto ?? 0, parte: p?.parceiro ?? 0,
    clientes: naConta.map(c => ({ cliente_id: c.cliente_id, nome: c.nome, lotes: c.lotes_mes, receita: c.receita_mes, parte: soma > 0 ? Math.round(((p?.parceiro ?? 0) * c.receita_mes / soma) * 100) / 100 : 0 })),
    foraDaConta: comReceita.filter(c => c.status !== CONTA_QUE_CONTA).map(c => ({ cliente_id: c.cliente_id, nome: c.nome, situacao: c.status, receita: c.receita_mes })),
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
  const livro = await comissaoMensal(fim, JANELA_REPASSE_BTG, regra.nome, 'BTG')
  const dele: Record<string, number> = {}
  for (const l of livro) dele[l.mes_ref] = (dele[l.mes_ref] ?? 0) + l.receita_carteira
  return { regra, impostoPct: cfg.impostoPct, meses: repassePorMes(cfg, regra.nome, receitaBtg, dele, desde) }
}

// A parte do parceiro na comissão do BTG mês a mês, até o mês corrente: é o que entra no "gerado" e no
// saldo a pagar dele. `desde` ('AAAA-MM-01') limita o começo: quem também tem regra de participação na
// receita (parceiros_receita) só conta o BTG a partir do início dessa regra.
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
