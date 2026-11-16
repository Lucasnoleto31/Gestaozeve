// Oportunidades da base: quem já é cliente da corretora e pode render mais sem lead novo. As abas são os
// mesmos grupos da tela Clientes (momentoCliente.ts), menos quem está operando normalmente:
//   Em risco (segurar) · Inativos (reativar) · Nunca operaram (ativar) · Em abertura (acompanhar).
// Em risco e Inativos vêm ordenados pelo que rendiam; Nunca operaram, pelos sinais de que o cliente está
// quente; Em abertura, por quem já gira. Lucas, 16/11/2026: alinhar com os grupos da lista. Até então
// "Reativar" juntava quem parou há pouco com quem está parado há meses (380 na Genial, contra 258 no
// cartão "Inativos") e quem tinha girado no mês e estava caindo não aparecia em lugar nenhum.
// Só funções puras (testes em oportunidades.test.ts); quem lê o banco é consultasOportunidades.ts.
import { giraFora, textoGiroFora, type GiroFora } from './giroFora'
import { diasEntre } from './meses'
import { momentoDoCliente } from './momentoCliente'

export type ClienteBase = {
  cliente_id: string
  nome: string
  telefone: string | null
  responsavel: string | null
  ativador: string | null          // atendente da campanha de ativação
  situacao: string                 // Ativo · Inativo · Nunca girou · Em processamento · Recusou
  risco: string | null             // parou · em queda
  dias_sem_giro: number | null
  data_migracao: string | null
  data_entrada: string | null
  lotes_mes: number
  lotes_media_3m: number           // média de lotes dos 3 meses anteriores
  lotes_12m: number
  receita_total: number
  meses_ativos: number             // meses com lote operado
  meses_sem_giro: number | null
  ultimo_giro: string | null
  contatos: number
  ultimo_contato: string | null
  patrimonio: number | null        // declarado no cadastro
  lead_ja_opera: string | null     // resposta do formulário: "Sim, já opero", "Já operei e parei"…
  lead_corretora: string | null    // onde opera, segundo o formulário
  fora: GiroFora | null            // giro do cliente em outra corretora do escritório (nos últimos meses)
}

// risco = Em risco (segurar) · reativar = Inativos · ativar = Nunca operaram · abertura = Em abertura.
// Os nomes antigos das abas continuam valendo nos endereços (?aba=reativar, ?aba=ativar).
export type TipoOportunidade = 'risco' | 'reativar' | 'ativar' | 'abertura'
export type Oportunidade = {
  tipo: TipoOportunidade
  cliente_id: string
  nome: string
  telefone: string | null
  responsavel: string | null
  ativador: string | null
  contatos: number
  ultimo_contato: string | null
  pontos: number                   // ordem dentro do tipo (maior primeiro)
  motivos: string[]                // por que está na lista, em palavras
  mediaAtiva: number               // em risco e inativos: receita média dos meses em que girou
  receitaTotal: number
  situacao: string                 // com o risco e os dias sem giro: o selo "Em queda" / "Parou há N dias"
  risco: string | null
  diasSemGiro: number | null
  lotesMes: number                 // em risco: quanto girou no mês
  media3m: number                  // em risco: quanto girava (lotes por mês nos 3 meses anteriores)
  mesesSemGiro: number | null
  ultimoGiro: string | null
  diasMigrado: number | null       // nunca operaram: há quantos dias a conta migrou
  patrimonio: number | null
  diasEmAbertura: number | null    // abertura: desde a data de entrada
  lotes12m: number                 // abertura: conta em abertura que já gira
  fora: GiroFora | null            // giro em outra corretora: quem gira lá não está parado, só não gira aqui
}
export type ResumoOportunidades = {
  // giramFora = giram em outra corretora no mês; potencialGiramFora = quanto esses rendiam aqui
  risco: { contas: number; potencialMes: number; pararam: number; emQueda: number; foraDaCampanha: number; contatados: number; giramFora: number }
  reativar: { contas: number; potencialMes: number; recentes: number; potencialRecentes: number; foraDaCampanha: number; contatados: number; giramFora: number; potencialGiramFora: number }
  ativar: { contas: number; recentes: number; jaOperam: number; prioridade: number; foraDaCampanha: number; contatados: number; giramFora: number }
  abertura: { contas: number; jaGiram: number; lotes12m: number; semContato: number; giramFora: number }
}

export const PATRIMONIO_ALTO = 1_000_000
export const PATRIMONIO_MEDIO = 300_000
// Inativo "recente": parou há até 6 meses (os mais fáceis de trazer de volta). Inativo começa no quarto
// mês sem giro; antes disso o cliente está em "Em risco".
export const MESES_RECENTE = 6

export const mediaAtiva = (c: Pick<ClienteBase, 'receita_total' | 'meses_ativos'>) => c.receita_total / Math.max(1, c.meses_ativos)
const reais = (v: number) => (v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`)
const haDias = (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`)

function base(c: ClienteBase, tipo: TipoOportunidade): Oportunidade {
  return {
    tipo, cliente_id: c.cliente_id, nome: c.nome, telefone: c.telefone, responsavel: c.responsavel, ativador: c.ativador, contatos: c.contatos, ultimo_contato: c.ultimo_contato,
    pontos: 0, motivos: [], mediaAtiva: 0, receitaTotal: c.receita_total, situacao: c.situacao, risco: c.risco, diasSemGiro: c.dias_sem_giro, lotesMes: c.lotes_mes, media3m: c.lotes_media_3m,
    mesesSemGiro: c.meses_sem_giro, ultimoGiro: c.ultimo_giro, diasMigrado: null, patrimonio: c.patrimonio, diasEmAbertura: null, lotes12m: c.lotes_12m, fora: c.fora,
  }
}

// Pontos de quem gira em outra corretora no mês (o sinal mais forte: já opera, falta trazer o giro) e de
// quem girou lá nos últimos meses
export const PONTOS_GIRA_FORA = 4
export const PONTOS_GIROU_FORA = 2

// Sinais de que a conta que nunca operou está quente: giro em outra corretora, migração recente, lead que
// já opera e patrimônio declarado
function sinaisDeAtivacao(c: ClienteBase, hoje: string, o: Oportunidade) {
  if (c.fora) { o.pontos += giraFora(c.fora) ? PONTOS_GIRA_FORA : PONTOS_GIROU_FORA; o.motivos.push(textoGiroFora(c.fora)) }
  if (c.data_migracao) {
    const d = diasEntre(c.data_migracao, hoje)
    o.diasMigrado = d
    if (d <= 30) { o.pontos += 3; o.motivos.push(`migrou ${haDias(d)}`) }
    else if (d <= 90) { o.pontos += 2; o.motivos.push(`migrou ${haDias(d)}`) }
    else if (d <= 365) o.pontos += 1
  }
  const resposta = (c.lead_ja_opera ?? '').toLowerCase()
  // "Outra" é a resposta do formulário para corretora fora da lista
  const onde = !c.lead_corretora ? '' : /^outra/i.test(c.lead_corretora) ? ' em outra corretora' : ` (${c.lead_corretora})`
  if (resposta.startsWith('sim')) { o.pontos += 2; o.motivos.push(`já opera${onde}`) }
  else if (resposta.includes('parei')) { o.pontos += 1; o.motivos.push(`já operou${onde}`) }
  const p = c.patrimonio ?? 0
  if (p >= PATRIMONIO_ALTO) { o.pontos += 2; o.motivos.push(`patrimônio de ${reais(p)}`) }
  else if (p >= PATRIMONIO_MEDIO) { o.pontos += 1; o.motivos.push(`patrimônio de ${reais(p)}`) }
}

// Cada cliente cai na aba do grupo dele (o mesmo grupo da tela Clientes); quem está operando normalmente
// e quem recusou ficam de fora
export function classificar(clientes: ClienteBase[], hoje: string): { risco: Oportunidade[]; reativar: Oportunidade[]; ativar: Oportunidade[]; abertura: Oportunidade[]; resumo: ResumoOportunidades } {
  const risco: Oportunidade[] = [], reativar: Oportunidade[] = [], ativar: Oportunidade[] = [], abertura: Oportunidade[] = []
  for (const c of clientes) {
    const grupo = momentoDoCliente(c)
    if (grupo === 'risco' || grupo === 'inativo') {
      const o = base(c, grupo === 'risco' ? 'risco' : 'reativar')
      o.mediaAtiva = mediaAtiva(c)
      o.pontos = o.mediaAtiva
      ;(grupo === 'risco' ? risco : reativar).push(o)
    } else if (grupo === 'nunca') {
      const o = base(c, 'ativar')
      sinaisDeAtivacao(c, hoje, o)
      ativar.push(o)
    } else if (grupo === 'abertura') {
      const o = base(c, 'abertura')
      if (c.data_entrada) o.diasEmAbertura = diasEntre(c.data_entrada, hoje)
      if (c.lotes_12m > 0) { o.pontos = c.lotes_12m; o.motivos.push('já gira: falta migrar a conta') }
      if (c.fora) o.motivos.push(textoGiroFora(c.fora))
      abertura.push(o)
    }
  }
  const nome = (a: Oportunidade, b: Oportunidade) => a.nome.localeCompare(b.nome, 'pt-BR')
  const nulosNoFim = (a: number | null, b: number | null, dir: 1 | -1) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : (a - b) * dir)
  // em risco: quem mais rendia primeiro; no empate, quem mais girava
  risco.sort((a, b) => b.mediaAtiva - a.mediaAtiva || b.media3m - a.media3m || nome(a, b))
  reativar.sort((a, b) => b.mediaAtiva - a.mediaAtiva || nulosNoFim(a.mesesSemGiro, b.mesesSemGiro, 1) || nome(a, b))
  ativar.sort((a, b) => b.pontos - a.pontos || nulosNoFim(a.diasMigrado, b.diasMigrado, 1) || (b.patrimonio ?? 0) - (a.patrimonio ?? 0) || nome(a, b))
  // em abertura: quem já gira aqui, depois quem gira em outra corretora, depois quem espera há mais tempo
  const lotesFora = (o: Oportunidade) => o.fora?.lotesMes ?? 0
  abertura.sort((a, b) => b.lotes12m - a.lotes12m || lotesFora(b) - lotesFora(a) || nulosNoFim(a.diasEmAbertura, b.diasEmAbertura, -1) || nome(a, b))

  const recentes = reativar.filter(o => o.mesesSemGiro != null && o.mesesSemGiro <= MESES_RECENTE)
  const soma = (xs: Oportunidade[]) => xs.reduce((s, o) => s + o.mediaAtiva, 0)
  const giram = (xs: Oportunidade[]) => xs.filter(o => giraFora(o.fora))
  return {
    risco, reativar, ativar, abertura,
    resumo: {
      risco: {
        contas: risco.length, potencialMes: soma(risco), pararam: risco.filter(o => o.risco === 'parou').length, emQueda: risco.filter(o => o.risco !== 'parou').length,
        foraDaCampanha: risco.filter(o => !o.ativador).length, contatados: risco.filter(o => o.contatos > 0).length, giramFora: giram(risco).length,
      },
      reativar: {
        contas: reativar.length, potencialMes: soma(reativar), recentes: recentes.length, potencialRecentes: soma(recentes),
        foraDaCampanha: reativar.filter(o => !o.ativador).length, contatados: reativar.filter(o => o.contatos > 0).length,
        giramFora: giram(reativar).length, potencialGiramFora: soma(giram(reativar)),
      },
      ativar: {
        contas: ativar.length, recentes: ativar.filter(o => o.diasMigrado != null && o.diasMigrado <= 90).length,
        jaOperam: ativar.filter(o => o.motivos.some(m => m.startsWith('já opera'))).length, prioridade: ativar.filter(o => o.pontos >= 3).length,
        foraDaCampanha: ativar.filter(o => !o.ativador).length, contatados: ativar.filter(o => o.contatos > 0).length,
        giramFora: giram(ativar).length,
      },
      abertura: {
        contas: abertura.length, jaGiram: abertura.filter(o => o.lotes12m > 0).length, lotes12m: abertura.reduce((s, o) => s + o.lotes12m, 0),
        semContato: abertura.filter(o => o.contatos === 0).length, giramFora: giram(abertura).length,
      },
    },
  }
}

// A aba Distribuir da Fila (o que era a tela Oportunidades de cada corretora): os grupos, na ordem das abas
// antigas, e o endereço de cada um. O grupo padrão (Em risco) não vai para o endereço.
export const GRUPOS_DISTRIBUIR: TipoOportunidade[] = ['risco', 'reativar', 'ativar', 'abertura']
export const hrefDistribuir = (corretora: string, grupo: TipoOportunidade = 'risco') =>
  `/fila?aba=distribuir&corretora=${corretora}${grupo === 'risco' ? '' : `&grupo=${grupo}`}`

// A frase do topo de cada grupo na aba Distribuir da Fila: quantos são, o que está em jogo e quantos
// ainda não estão com nenhum atendente
export function fraseDeDistribuir(tipo: TipoOportunidade, r: ResumoOportunidades, corretora: string): string {
  const n = (v: number) => v.toLocaleString('pt-BR')
  const rs = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`
  const em = corretora === 'BTG' ? 'no BTG' : `na ${corretora}`
  const semAtendente = (v: number) => (v === 0 ? 'Todos já estão com um atendente.' : v === 1 ? '1 ainda não está com nenhum atendente.' : `${n(v)} ainda não estão com nenhum atendente.`)
  if (tipo === 'risco') {
    const x = r.risco
    if (!x.contas) return `Nenhum cliente em risco ${em}.`
    const rendiam = x.potencialMes >= 1 ? `, que ${x.contas === 1 ? 'rendia' : 'rendiam'} ${rs(x.potencialMes)} por mês` : ''
    return `${x.contas === 1 ? '1 cliente em risco' : `${n(x.contas)} clientes em risco`} ${em}${rendiam}. ${semAtendente(x.foraDaCampanha)}`
  }
  if (tipo === 'reativar') {
    const x = r.reativar
    if (!x.contas) return `Nenhum cliente inativo ${em}.`
    const rendiam = x.potencialMes >= 1 ? `, que ${x.contas === 1 ? 'rendia' : 'rendiam'} ${rs(x.potencialMes)} por mês quando ${x.contas === 1 ? 'girava' : 'giravam'}` : ''
    return `${x.contas === 1 ? '1 cliente inativo' : `${n(x.contas)} clientes inativos`} ${em}${rendiam}. ${semAtendente(x.foraDaCampanha)}`
  }
  if (tipo === 'ativar') {
    const x = r.ativar
    if (!x.contas) return `Nenhuma conta migrada sem operar ${em}.`
    return `${x.contas === 1 ? '1 conta migrou e nunca operou' : `${n(x.contas)} contas migraram e nunca operaram`} ${em}; ${x.prioridade === 1 ? '1 tem' : `${n(x.prioridade)} têm`} prioridade alta. ${semAtendente(x.foraDaCampanha)}`
  }
  const x = r.abertura
  if (!x.contas) return `Nenhuma conta em abertura ${em}.`
  return `${x.contas === 1 ? '1 conta em abertura' : `${n(x.contas)} contas em abertura`} ${em}; ${x.jaGiram === 1 ? '1 já gira' : `${n(x.jaGiram)} já giram`} e ${x.semContato === 1 ? '1 não tem' : `${n(x.semContato)} não têm`} contato registrado.`
}
