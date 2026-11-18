// Leituras da remuneração da equipe por níveis (S62). A conta fica em remuneracao.ts (funções puras); aqui
// entram a tabela de níveis e a régua, quem está no modelo, os eventos do motor de comissões, o giro de cada
// cliente da base, o incentivo, a parte de parceiro com participação na Genial e a cadeia do BTG. Só servidor.
import { cache } from 'react'
import { normTexto } from '@/lib/texto'
import type { Corretora } from '@/lib/corretoras'
import { equipe, equipeLeads, falha, num, responsavelDoUsuario, str, type Admin } from './guard'
import { calcularRepasse, configBtg } from './btg'
import { funcaoAusente } from './consultas'
import { participacaoReceita, regrasReceita } from './consultasParticipacao'
import { mesAtual, somarMeses } from './meses'
import {
  NIVEIS_PADRAO, REGUA_PADRAO, chaveMes, contaDaPessoa, fatoresBtg, liquidoGenial, vigente,
  type ContaMes, type DadosRemuneracao, type EventoComissao, type FatoresBtg, type PessoaModelo, type Regua, type TabelaNiveis,
} from './remuneracao'
import type { Parametro } from './tipos'

type Row = Record<string, unknown>
const PAGINA = 10000
const LOTE_DE_IDS = 100

// Tabela ou coluna que ainda não existe (S62 não rodou)
const semS62 = (e: { code?: string; message: string } | null) =>
  !!e && (['PGRST205', 'PGRST204', '42P01', '42703'].includes(e.code ?? '') || /does not exist|could not find/i.test(e.message))

// No desenvolvimento, sem a S62, vale a tabela fechada em 18/11/2026 com as três pessoas desde novembro, para
// as telas poderem ser vistas antes do script rodar. Em produção, sem a S62 ninguém está no modelo.
const PESSOAS_PADRAO: PessoaModelo[] = [
  { nome: 'Aikon', nivelDesde: '2026-11-01', trabalhaDesde: '2026-01-01' },
  { nome: 'Karen', nivelDesde: '2026-11-01', trabalhaDesde: '2026-10-01' },
  { nome: 'Milena', nivelDesde: '2026-11-01', trabalhaDesde: '2026-10-01' },
]

export type ConfigRemuneracao = { instalado: boolean; tabelas: TabelaNiveis[]; reguas: Regua[]; pessoas: PessoaModelo[]; comissionados: string[] }

const dia1 = (v: unknown) => (v == null ? null : `${String(v).slice(0, 7)}-01`)

async function lerConfig(db: Admin): Promise<ConfigRemuneracao> {
  const [niv, reg, resp, com] = await Promise.all([
    db.from('remuneracao_niveis').select('*').order('vigencia').order('nivel'),
    db.from('remuneracao_regua').select('*').order('vigencia'),
    db.from('responsaveis').select('nome, nivel_desde, trabalha_desde').not('nivel_desde', 'is', null),
    db.from('responsaveis').select('nome').eq('comissionado', true),
  ])
  if (com.error) falha(com.error, 'responsaveis')
  const comissionados = ((com.data ?? []) as Row[]).map(r => String(r.nome))
  if (semS62(niv.error) || semS62(reg.error) || semS62(resp.error)) {
    const dev = process.env.NODE_ENV !== 'production'
    return { instalado: false, tabelas: [NIVEIS_PADRAO], reguas: [REGUA_PADRAO], pessoas: dev ? PESSOAS_PADRAO : [], comissionados }
  }
  if (niv.error) falha(niv.error, 'remuneracao_niveis')
  if (reg.error) falha(reg.error, 'remuneracao_regua')
  if (resp.error) falha(resp.error, 'responsaveis')
  const porVigencia = new Map<string, TabelaNiveis>()
  for (const r of (niv.data ?? []) as Row[]) {
    const vig = String(r.vigencia).slice(0, 10)
    const t = porVigencia.get(vig) ?? { vigencia: vig, niveis: [] }
    t.niveis.push({
      nivel: num(r.nivel), pontosMin: num(r.pontos_min), fixo: num(r.fixo), abertura: num(r.abertura), ativacao: num(r.ativacao),
      reativacaoVolta: num(r.reativacao_volta), reativacao3Meses: num(r.reativacao_3meses), bonus1Ano: num(r.bonus_1ano), bonusDepois: num(r.bonus_depois),
    })
    porVigencia.set(vig, t)
  }
  const reguas: Regua[] = ((reg.data ?? []) as Row[]).map(r => ({
    vigencia: String(r.vigencia).slice(0, 10), pontosAbertura: num(r.pontos_abertura),
    pontosAtivacao: { GENIAL: num(r.pontos_ativacao_genial), BTG: num(r.pontos_ativacao_btg), XP: num(r.pontos_ativacao_xp) },
    pontosReativacao: num(r.pontos_reativacao), reaisPorPonto: num(r.reais_por_ponto) || 1000, mesesBonusCheio: num(r.meses_bonus_cheio),
    mesesRevisao: num(r.meses_revisao) || 3, mesesPermanencia: num(r.meses_permanencia) || 3,
    genialRetencaoPct: num(r.genial_retencao_pct), genialPisCofinsPct: num(r.genial_pis_cofins_pct), genialIrPct: num(r.genial_ir_pct), genialPlataformaLote: num(r.genial_plataforma_lote),
  }))
  const pessoas: PessoaModelo[] = ((resp.data ?? []) as Row[])
    .map(r => ({ nome: String(r.nome), nivelDesde: dia1(r.nivel_desde) as string, trabalhaDesde: dia1(r.trabalha_desde) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const tabelas = [...porVigencia.values()].filter(t => t.niveis.length > 0)
  return { instalado: true, tabelas: tabelas.length ? tabelas : [NIVEIS_PADRAO], reguas: reguas.length ? reguas : [REGUA_PADRAO], pessoas, comissionados }
}

async function rpcTudo(db: Admin, fn: string, args: Record<string, unknown>): Promise<Row[]> {
  const out: Row[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db.rpc(fn, args).range(de, de + PAGINA - 1)
    if (error) falha(error, fn)
    const rows = (data ?? []) as Row[]
    out.push(...rows)
    if (rows.length < PAGINA) break
  }
  return out
}

// Toda a história de eventos de cada pessoa (comissao_eventos), com o valor pela regra por conta
async function lerEventos(db: Admin, nomes: string[]): Promise<EventoComissao[]> {
  const porPessoa = await Promise.all(nomes.map(async pessoa => (await rpcTudo(db, 'comissao_eventos', { p_parceiro: pessoa, p_corretora: null })).map<EventoComissao>(r => ({
    pessoa, cliente_id: String(r.cliente_id), nome: String(r.nome ?? ''), corretora: String(r.corretora ?? ''),
    tipo: r.tipo === 'abertura' || r.tipo === 'reativacao' ? r.tipo : 'ativacao', data: String(r.data ?? '').slice(0, 10), mes_ref: String(r.mes_ref ?? '').slice(0, 10), valor: num(r.valor),
  }))))
  return porPessoa.flat()
}

type GiroMes = { cliente_id: string; corretora: string; mes: string; lotes: number; receita: number }

// Lotes e receita de cada cliente da base, mês a mês: a soma de lotes_mes (contas, produtos e códigos), a
// mesma da lista de clientes. remuneracao_giro (S62) traz só os clientes pedidos; sem ela, a lista de clientes
// de cada mês e corretora.
async function lerGiro(db: Admin, ids: string[], meses: string[]): Promise<GiroMes[]> {
  const mesIni = meses[0], mesFim = meses[meses.length - 1]
  const partes = Array.from({ length: Math.ceil(ids.length / LOTE_DE_IDS) }, (_, i) => ids.slice(i * LOTE_DE_IDS, (i + 1) * LOTE_DE_IDS))
  const pelaFuncao = await (async () => {
    const out: GiroMes[] = []
    for (const lote of partes) {
      const { data, error } = await db.rpc('remuneracao_giro', { p_clientes: lote, p_mes_ini: mesIni, p_mes_fim: mesFim }).range(0, PAGINA - 1)
      if (error) { if (funcaoAusente(error)) return null; falha(error, 'remuneracao_giro') }
      for (const r of (data ?? []) as Row[]) out.push({ cliente_id: String(r.cliente_id), corretora: String(r.corretora), mes: String(r.mes_ref).slice(0, 10), lotes: num(r.lotes), receita: num(r.receita) })
    }
    return out
  })()
  if (pelaFuncao) return pelaFuncao
  const pedidos = new Set(ids)
  const porMes = await Promise.all(meses.flatMap(mes => (['GENIAL', 'BTG'] as const).map(async corretora =>
    (await rpcTudo(db, 'clientes_lista', { p_corretora: corretora, p_mes_ref: mes }))
      .filter(r => pedidos.has(String(r.cliente_id)) && (num(r.lotes_mes) > 0 || num(r.receita_mes) > 0))
      .map<GiroMes>(r => ({ cliente_id: String(r.cliente_id), corretora, mes, lotes: num(r.lotes_mes), receita: num(r.receita_mes) })))))
  return porMes.flat()
}

// Incentivo da Genial por cliente, mês a mês (a mesma conta da tela Incentivo)
async function lerIncentivo(db: Admin, meses: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  await Promise.all(meses.map(async mes => {
    for (const r of await rpcTudo(db, 'incentivo_mes', { p_corretora: 'GENIAL', p_mes_ref: mes })) {
      const id = str(r.cliente_id)
      if (!id) continue
      const k = chaveMes(id, 'GENIAL', mes)
      out.set(k, (out.get(k) ?? 0) + num(r.valor_incentivo))
    }
  }))
  return out
}

// A parte de parceiro com participação na receita da Genial, por cliente e mês (a mesma conta de Comissões).
// Precisa do acesso da equipe; sem ele (atendente) a parte fica de fora.
async function lerPartesGenial(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  let regras
  try { regras = await regrasReceita(['GENIAL']) } catch { return out }
  const nomes = [...new Set(regras.flatMap(r => r.regras.map(x => x.nome)))]
  const livros = await Promise.all(nomes.map(nome => participacaoReceita('GENIAL', regras.find(r => r.corretora === 'GENIAL')?.regras ?? [], nome)))
  for (const l of livros) for (const m of l.meses) for (const c of m.clientes) {
    if (!c.cliente_id) continue
    const k = chaveMes(c.cliente_id, 'GENIAL', m.mes.slice(0, 10))
    out.set(k, (out.get(k) ?? 0) + c.total)
  }
  return out
}

// Fatores do BTG mês a mês: o que fica para o escritório de cada R$ 1 de receita do cliente direto e do cliente
// de cada parceiro com participação, pela cadeia do Painel (percentual do fechamento ou faixas)
async function lerFatoresBtg(db: Admin, meses: string[], mesFim: string): Promise<{ fatores: Map<string, FatoresBtg>; parceiros: string[] }> {
  const { data, error } = await db.from('parametros').select('chave, valor, descricao').eq('corretora', 'BTG')
  if (error) falha(error, 'parametros')
  const cfg = configBtg(((data ?? []) as Row[]).map<Parametro>(r => ({ chave: String(r.chave), valor: String(r.valor ?? ''), descricao: str(r.descricao) })))
  const mensal = await rpcTudo(db, 'painel_mensal', { p_corretora: 'BTG', p_mes_ref: mesFim, p_meses: meses.length + 1 })
  const receitaDoMes = new Map(mensal.map(m => [String(m.mes_ref).slice(0, 10), num(m.receita)]))
  const fatores = new Map<string, FatoresBtg>()
  for (const mes of meses) {
    const receita = receitaDoMes.get(mes) ?? 0
    const k = receita > 0 ? calcularRepasse(receita, cfg, mes).comissao / receita : 0
    fatores.set(mes, fatoresBtg(k, cfg))
  }
  return { fatores, parceiros: cfg.parceiros.map(p => p.nome) }
}

async function lerParceiroDaFicha(db: Admin, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const partes = Array.from({ length: Math.ceil(ids.length / LOTE_DE_IDS) }, (_, i) => ids.slice(i * LOTE_DE_IDS, (i + 1) * LOTE_DE_IDS))
  await Promise.all(partes.map(async lote => {
    const { data, error } = await db.from('cliente_corretora').select('cliente_id, parceiro').eq('corretora', 'BTG').in('cliente_id', lote).not('parceiro', 'is', null)
    if (error) falha(error, 'cliente_corretora')
    for (const r of (data ?? []) as Row[]) out.set(String(r.cliente_id), String(r.parceiro))
  }))
  return out
}

export type Remuneracao = {
  config: ConfigRemuneracao
  dados: DadosRemuneracao
  mesIni: string        // primeiro mês com o giro da base carregado (3 meses antes da entrada mais antiga no modelo)
  mesFim: string        // o mês corrente
}

// Tudo o que a conta precisa, de mesIni até o mês corrente. `comParceirosGenial` = descontar a parte de parceiro
// com participação na Genial (precisa do acesso da equipe).
async function carregar(db: Admin, comParceirosGenial: boolean, configLida?: ConfigRemuneracao): Promise<Remuneracao> {
  const config = configLida ?? await lerConfig(db)
  const mesFim = mesAtual()
  const entradas = config.pessoas.map(p => p.nivelDesde).sort()
  const mesIni = entradas.length ? somarMeses(entradas[0], -3) : mesFim
  // a base de cada um depende dos movimentos de todos os comissionados (o cliente é de quem mexeu por último)
  const nomes = [...new Set([...config.comissionados, ...config.pessoas.map(p => p.nome)])]
  const eventos = config.pessoas.length ? await lerEventos(db, nomes) : []
  const ids = [...new Set(eventos.map(e => e.cliente_id))]
  const meses: string[] = []
  for (let m = mesIni; m <= mesFim; m = somarMeses(m, 1)) meses.push(m)
  const [giro, incentivo, partes, btg, parceiroBtg] = await Promise.all([
    ids.length ? lerGiro(db, ids, meses) : Promise.resolve([]),
    ids.length ? lerIncentivo(db, meses) : Promise.resolve(new Map<string, number>()),
    ids.length && comParceirosGenial ? lerPartesGenial() : Promise.resolve(new Map<string, number>()),
    ids.length ? lerFatoresBtg(db, meses, mesFim) : Promise.resolve({ fatores: new Map<string, FatoresBtg>(), parceiros: [] as string[] }),
    ids.length ? lerParceiroDaFicha(db, ids) : Promise.resolve(new Map<string, string>()),
  ])
  const liquido = new Map<string, number>()
  const girou = new Set<string>()
  for (const g of giro) {
    const k = chaveMes(g.cliente_id, g.corretora, g.mes)
    if (g.lotes > 0) girou.add(k)
    if (g.lotes <= 0 && g.receita <= 0) continue
    const regua = vigente(config.reguas, g.mes) ?? REGUA_PADRAO
    if (g.corretora === 'GENIAL') {
      liquido.set(k, liquidoGenial({ receita: g.receita, lotes: g.lotes, incentivo: incentivo.get(k) ?? 0, parteParceiro: partes.get(k) ?? 0 }, regua))
    } else if (g.corretora === 'BTG') {
      const f = btg.fatores.get(g.mes)
      if (!f) continue
      const parceiro = parceiroBtg.get(g.cliente_id)
      const dono = parceiro ? btg.parceiros.find(p => normTexto(p) === normTexto(parceiro)) : undefined
      liquido.set(k, g.receita * (dono ? f.parceiros[dono] ?? 0 : f.direto))
    }
    // XP: sem cadeia ainda, o cliente não entra na base
  }
  return { config, dados: { pessoas: config.pessoas, tabelas: config.tabelas, reguas: config.reguas, eventos, liquido, girou }, mesIni, mesFim }
}

// Comissões (admin e vendedor): a remuneração de toda a equipe, uma vez por requisição
export const remuneracaoDaEquipe = cache(async (): Promise<Remuneracao> => {
  const { db } = await equipe()
  return carregar(db, true)
})

// As contas de uma pessoa nos meses pedidos (em ordem)
export function contasDe(r: Remuneracao, nome: string, meses: string[]): ContaMes[] {
  return contaDaPessoa(nome, [...meses].sort(), r.dados)
}

// O que a pessoa gerou até o mês corrente: a comissão por conta antes do modelo e a conta do nível depois,
// dentro do filtro de corretora (null = todas)
export function geradoAteHoje(r: Remuneracao, nome: string, corretora: Corretora | null): number {
  const pessoa = r.config.pessoas.find(p => p.nome === nome)
  const doFiltro = (c: string) => !corretora || c === corretora
  const desde = pessoa?.nivelDesde ?? '9999-12-01'
  const antes = r.dados.eventos.filter(e => e.pessoa === nome && e.mes_ref < desde && doFiltro(e.corretora)).reduce((s, e) => s + e.valor, 0)
  if (!pessoa) return Math.round(antes * 100) / 100
  const meses: string[] = []
  for (let m = pessoa.nivelDesde; m <= r.mesFim; m = somarMeses(m, 1)) meses.push(m)
  const depois = contasDe(r, nome, meses).reduce((s, c) => s + (corretora ? c.valor.porCorretora[corretora]?.total ?? 0 : c.valor.total), 0)
  return Math.round((antes + depois) * 100) / 100
}

export const pessoaNoModelo = (r: Remuneracao, nome: string): PessoaModelo | null => r.config.pessoas.find(p => normTexto(p.nome) === normTexto(nome)) ?? null

// Meus pontos (Início e Leads): só a conta de quem está logado, se estiver no modelo
export type MeusPontos = { pessoa: PessoaModelo; conta: ContaMes; tabela: TabelaNiveis; regua: Regua; instalado: boolean }
export async function meusPontos(): Promise<MeusPontos | null> {
  const { db, profile } = await equipeLeads()
  const [nome, config] = await Promise.all([responsavelDoUsuario(db, profile.nome ?? ''), lerConfig(db)])
  // quem não está no modelo não paga a leitura da conta inteira (eventos, giro, incentivo e cadeia do BTG)
  const dele = config.pessoas.find(p => normTexto(p.nome) === normTexto(nome))
  if (!dele || mesAtual() < dele.nivelDesde) return null
  const r = await carregar(db, profile.role !== 'atendente', config)
  const pessoa = pessoaNoModelo(r, nome)
  if (!pessoa) return null
  const [conta] = contasDe(r, pessoa.nome, [r.mesFim])
  return { pessoa, conta, tabela: vigente(r.config.tabelas, r.mesFim) ?? NIVEIS_PADRAO, regua: vigente(r.config.reguas, r.mesFim) ?? REGUA_PADRAO, instalado: r.config.instalado }
}
