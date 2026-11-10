// Oportunidades da base: quem já tem conta na corretora e pode render mais sem lead novo —
// inativos para reativar (ordenados pelo que rendiam), contas migradas que nunca giraram para ativar
// (ordenadas por sinais de que o cliente está quente) e contas ainda em abertura.
// Só funções puras (testes em oportunidades.test.ts); quem lê o banco é consultasOportunidades.ts.
import { diasEntre } from './meses'

export type ClienteBase = {
  cliente_id: string
  nome: string
  telefone: string | null
  responsavel: string | null
  ativador: string | null          // atendente da campanha de ativação
  situacao: string                 // Ativo · Inativo · Nunca girou · Em processamento · Recusou
  data_migracao: string | null
  data_entrada: string | null
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
}

export type TipoOportunidade = 'reativar' | 'ativar' | 'abertura'
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
  mediaAtiva: number               // reativar: receita média dos meses em que girou
  receitaTotal: number
  mesesSemGiro: number | null
  ultimoGiro: string | null
  diasMigrado: number | null       // ativar: há quantos dias a conta migrou
  patrimonio: number | null
  diasEmAbertura: number | null    // abertura: desde a data de entrada
  lotes12m: number                 // abertura: conta em abertura que já gira
}
export type ResumoOportunidades = {
  reativar: { contas: number; potencialMes: number; recentes: number; potencialRecentes: number; foraDaCampanha: number; contatados: number }
  ativar: { contas: number; recentes: number; jaOperam: number; prioridade: number; foraDaCampanha: number; contatados: number }
  abertura: { contas: number; jaGiram: number; lotes12m: number; semContato: number }
}

export const PATRIMONIO_ALTO = 1_000_000
export const PATRIMONIO_MEDIO = 300_000
// Inativo "recente": parou há até 3 meses (mais fácil de trazer de volta)
export const MESES_RECENTE = 3

export const mediaAtiva = (c: Pick<ClienteBase, 'receita_total' | 'meses_ativos'>) => c.receita_total / Math.max(1, c.meses_ativos)
const reais = (v: number) => (v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`)
const haDias = (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`)

function base(c: ClienteBase, tipo: TipoOportunidade): Oportunidade {
  return {
    tipo, cliente_id: c.cliente_id, nome: c.nome, telefone: c.telefone, responsavel: c.responsavel, ativador: c.ativador, contatos: c.contatos, ultimo_contato: c.ultimo_contato,
    pontos: 0, motivos: [], mediaAtiva: 0, receitaTotal: c.receita_total, mesesSemGiro: c.meses_sem_giro, ultimoGiro: c.ultimo_giro,
    diasMigrado: null, patrimonio: c.patrimonio, diasEmAbertura: null, lotes12m: c.lotes_12m,
  }
}

// Sinais de que a conta que nunca girou está quente: migração recente, lead que já opera e patrimônio declarado
function sinaisDeAtivacao(c: ClienteBase, hoje: string, o: Oportunidade) {
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

export function classificar(clientes: ClienteBase[], hoje: string): { reativar: Oportunidade[]; ativar: Oportunidade[]; abertura: Oportunidade[]; resumo: ResumoOportunidades } {
  const reativar: Oportunidade[] = [], ativar: Oportunidade[] = [], abertura: Oportunidade[] = []
  for (const c of clientes) {
    if (c.situacao === 'Inativo') {
      const o = base(c, 'reativar')
      o.mediaAtiva = mediaAtiva(c)
      o.pontos = o.mediaAtiva
      reativar.push(o)
    } else if (c.situacao === 'Nunca girou') {
      const o = base(c, 'ativar')
      sinaisDeAtivacao(c, hoje, o)
      ativar.push(o)
    } else if (c.situacao === 'Em processamento') {
      const o = base(c, 'abertura')
      if (c.data_entrada) o.diasEmAbertura = diasEntre(c.data_entrada, hoje)
      if (c.lotes_12m > 0) { o.pontos = c.lotes_12m; o.motivos.push('já gira: falta migrar a conta') }
      abertura.push(o)
    }
  }
  const nome = (a: Oportunidade, b: Oportunidade) => a.nome.localeCompare(b.nome, 'pt-BR')
  const nulosNoFim = (a: number | null, b: number | null, dir: 1 | -1) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : (a - b) * dir)
  reativar.sort((a, b) => b.mediaAtiva - a.mediaAtiva || nulosNoFim(a.mesesSemGiro, b.mesesSemGiro, 1) || nome(a, b))
  ativar.sort((a, b) => b.pontos - a.pontos || nulosNoFim(a.diasMigrado, b.diasMigrado, 1) || (b.patrimonio ?? 0) - (a.patrimonio ?? 0) || nome(a, b))
  abertura.sort((a, b) => b.lotes12m - a.lotes12m || nulosNoFim(a.diasEmAbertura, b.diasEmAbertura, -1) || nome(a, b))

  const recentes = reativar.filter(o => o.mesesSemGiro != null && o.mesesSemGiro <= MESES_RECENTE)
  const soma = (xs: Oportunidade[]) => xs.reduce((s, o) => s + o.mediaAtiva, 0)
  return {
    reativar, ativar, abertura,
    resumo: {
      reativar: {
        contas: reativar.length, potencialMes: soma(reativar), recentes: recentes.length, potencialRecentes: soma(recentes),
        foraDaCampanha: reativar.filter(o => !o.ativador).length, contatados: reativar.filter(o => o.contatos > 0).length,
      },
      ativar: {
        contas: ativar.length, recentes: ativar.filter(o => o.diasMigrado != null && o.diasMigrado <= 90).length,
        jaOperam: ativar.filter(o => o.motivos.some(m => m.startsWith('já opera'))).length, prioridade: ativar.filter(o => o.pontos >= 3).length,
        foraDaCampanha: ativar.filter(o => !o.ativador).length, contatados: ativar.filter(o => o.contatos > 0).length,
      },
      abertura: { contas: abertura.length, jaGiram: abertura.filter(o => o.lotes12m > 0).length, lotes12m: abertura.reduce((s, o) => s + o.lotes12m, 0), semContato: abertura.filter(o => o.contatos === 0).length },
    },
  }
}
