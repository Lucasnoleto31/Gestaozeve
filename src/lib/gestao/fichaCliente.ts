// Ficha do cliente: o que fazer com este cliente agora (o próximo passo, em palavras), o giro dele dia
// a dia tirado do extrato, como ele opera e o aniversário. Só funções puras (testes em
// fichaCliente.test.ts); quem lê o banco é consultas.ts / consultasFicha.ts.
import { diasEntre } from './meses'
import { fmtNum } from '@/lib/format'
import type { ExtratoRow } from './tipos'

const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '')
const nDias = (n: number) => `${fmtNum(n)} ${n === 1 ? 'dia' : 'dias'}`
const nMeses = (n: number) => `${fmtNum(n)} ${n === 1 ? 'mês' : 'meses'}`
const inteiro = (v: number) => fmtNum(Math.round(v))
const reais = (v: number) => `R$ ${inteiro(v)}`

// ── O próximo passo ─────────────────────────────────────────────────────────
export type TomPasso = 'gain' | 'warn' | 'loss' | 'neutral'
export type PassoCliente = { tom: TomPasso; titulo: string; texto: string }

export type ClienteDoPasso = {
  situacao: string                       // Ativo · Inativo · Nunca girou · Em processamento · Recusou
  risco: string | null                   // parou · em queda
  dias_sem_giro: number | null
  meses_sem_giro: number | null
  ultimo_giro: string | null
  lotes_mes: number
  lotes_media_3m: number                 // média dos 3 meses anteriores
  lotes_12m: number
  receita_total: number
  meses_ativos: number
  data_entrada: string | null
  data_migracao: string | null
  motivo_recusa: string | null
}
export type AtendimentoDoPasso = {
  hoje: string
  mes: string                            // rótulo do mês de referência ('nov/26')
  mesParcial?: boolean                   // o mês de referência ainda está correndo
  contatos: number
  ultimoContato: string | null
  proximoContato: string | null          // retorno combinado
}

// Conta em abertura há mais que isto pede atenção
export const DIAS_ABERTURA_ALERTA = 7

// A situação do cliente em uma frase e o que ela pede. O retorno combinado, quando venceu, vem na frente.
export function proximoPasso(c: ClienteDoPasso, a: AtendimentoDoPasso): PassoCliente {
  const contato = a.contatos === 0
    ? 'Ainda sem contato registrado.'
    : `${a.contatos === 1 ? '1 contato registrado' : `${fmtNum(a.contatos)} contatos registrados`}${a.ultimoContato ? `, o último em ${dataBr(a.ultimoContato)}` : ''}.`
  const estado = estadoDoCliente(c, a, contato)

  if (a.proximoContato && a.proximoContato <= a.hoje) {
    const atraso = diasEntre(a.proximoContato, a.hoje)
    return {
      tom: 'warn',
      titulo: atraso === 0 ? 'Retorno combinado para hoje' : `Retorno atrasado há ${nDias(atraso)}`,
      texto: `Ficou combinado falar com o cliente em ${dataBr(a.proximoContato)}. ${estado.titulo}: ${estado.texto.charAt(0).toLowerCase()}${estado.texto.slice(1)}`,
    }
  }
  if (a.proximoContato) return { ...estado, texto: `${estado.texto} Retorno marcado para ${dataBr(a.proximoContato)}.` }
  return estado
}

function estadoDoCliente(c: ClienteDoPasso, a: AtendimentoDoPasso, contato: string): PassoCliente {
  if (c.situacao === 'Recusou') {
    return { tom: 'neutral', titulo: 'Recusou a migração', texto: c.motivo_recusa ? `Motivo: ${c.motivo_recusa}.` : 'Sem motivo registrado na ficha.' }
  }
  if (c.situacao === 'Em processamento') {
    const n = c.data_entrada ? diasEntre(c.data_entrada, a.hoje) : null
    return {
      tom: n != null && n > DIAS_ABERTURA_ALERTA ? 'warn' : 'neutral',
      titulo: n != null && n > 0 ? `Conta em abertura há ${nDias(n)}` : 'Conta em abertura',
      texto: c.lotes_12m > 0
        ? `Já gira com a conta em abertura (${inteiro(c.lotes_12m)} lotes em 12 meses): falta migrar a conta. ${contato}`
        : `Acompanhar a abertura até a migração. ${contato}`,
    }
  }
  if (c.situacao === 'Nunca girou') {
    const n = c.data_migracao ? diasEntre(c.data_migracao, a.hoje) : null
    return {
      tom: 'warn',
      titulo: n != null && n > 0 ? `Migrou há ${nDias(n)} e ainda não operou` : 'Migrou e ainda não operou',
      texto: `Falar com o cliente para a primeira operação. ${contato}`,
    }
  }
  if (c.risco === 'parou') {
    return {
      tom: 'loss',
      titulo: c.dias_sem_giro != null ? `Parou há ${nDias(c.dias_sem_giro)}` : 'Parou de girar',
      texto: `Girava em média ${inteiro(c.lotes_media_3m)} lotes por mês nos 3 meses anteriores${c.ultimo_giro ? `; o último giro foi em ${dataBr(c.ultimo_giro)}` : ''}. ${contato}`,
    }
  }
  if (c.risco === 'em queda') {
    return {
      tom: 'warn',
      titulo: 'Girando bem menos que o normal',
      texto: `${inteiro(c.lotes_mes)} lotes em ${a.mes}${a.mesParcial ? ' até agora,' : ''} contra a média de ${inteiro(c.lotes_media_3m)} por mês nos 3 meses anteriores. ${contato}`,
    }
  }
  if (c.situacao === 'Inativo') {
    const rendia = c.receita_total / Math.max(1, c.meses_ativos)
    return {
      tom: 'warn',
      titulo: c.meses_sem_giro ? `Sem giro há ${nMeses(c.meses_sem_giro)}` : 'Sem giro',
      texto: `${rendia > 0 ? `Rendia ${reais(rendia)} por mês nos ${nMeses(Math.max(1, c.meses_ativos))} em que girou` : 'Já girou e parou'}${c.ultimo_giro ? `; o último giro foi em ${dataBr(c.ultimo_giro)}` : ''}. ${contato}`,
    }
  }
  if (c.situacao === 'Ativo') {
    return {
      tom: 'gain',
      titulo: 'Operando normalmente',
      // mês em andamento: o número ainda vai crescer, então não se compara de igual para igual
      texto: c.lotes_media_3m <= 0
        ? `${inteiro(c.lotes_mes)} lotes em ${a.mes}${a.mesParcial ? ' até agora' : ''} (ainda sem média dos meses anteriores).`
        : a.mesParcial
          ? `${inteiro(c.lotes_mes)} lotes em ${a.mes} até agora; a média dos 3 meses anteriores foi de ${inteiro(c.lotes_media_3m)} por mês.`
          : `${inteiro(c.lotes_mes)} lotes em ${a.mes}, contra a média de ${inteiro(c.lotes_media_3m)} por mês nos 3 meses anteriores.`,
    }
  }
  return { tom: 'neutral', titulo: c.situacao || 'Sem situação', texto: contato }
}

// Há quanto tempo, em palavras ('hoje', 'ontem', 'há 12 dias'; no futuro: 'amanhã', 'em 3 dias')
export function quando(iso: string | null | undefined, hoje: string): string | null {
  if (!iso) return null
  const n = diasEntre(iso.slice(0, 10), hoje)
  if (n === 0) return 'hoje'
  if (n === 1) return 'ontem'
  if (n === -1) return 'amanhã'
  return n > 0 ? `há ${nDias(n)}` : `em ${nDias(-n)}`
}

// ── Giro dia a dia, a partir do extrato ─────────────────────────────────────
export type DiaDoCliente = { dia: string; lotes: number; zerados: number; receita: number; operacoes: number; ativos: string[] }
export type GiroPorDia = { dias: DiaDoCliente[]; completo: boolean }

// Soma os lançamentos por dia (mais recente primeiro). O extrato vem com um teto de linhas: quando
// chega cheio, o dia mais antigo pode estar cortado e sai da lista (`completo` = veio o histórico todo).
export function giroPorDia(extrato: ExtratoRow[], teto = 400): GiroPorDia {
  const porDia = new Map<string, DiaDoCliente>()
  for (const l of extrato) {
    let d = porDia.get(l.data)
    if (!d) { d = { dia: l.data, lotes: 0, zerados: 0, receita: 0, operacoes: 0, ativos: [] }; porDia.set(l.data, d) }
    d.lotes += l.lotes_operados
    d.zerados += l.lotes_zerados
    d.receita += l.receita_corretagem + l.receita_zeragem
    d.operacoes += 1
    if (l.ativo && !d.ativos.includes(l.ativo)) d.ativos.push(l.ativo)
  }
  const dias = [...porDia.values()].sort((x, y) => (x.dia < y.dia ? 1 : x.dia > y.dia ? -1 : 0))
  const completo = extrato.length < teto
  return { dias: completo ? dias : dias.slice(0, -1), completo }
}

// Dias com giro e média por dia operado num mês ('AAAA-MM-01'). null quando o extrato não cobre o
// mês inteiro (veio cortado dentro dele ou nem chega até ele).
export function diasOperadosNoMes(giro: GiroPorDia, mes: string): { operados: number; mediaPorDia: number; lotes: number } | null {
  const prefixo = mes.slice(0, 7)
  const maisAntigo = giro.dias[giro.dias.length - 1]
  if (!giro.completo && (!maisAntigo || maisAntigo.dia.slice(0, 7) >= prefixo)) return null
  const doMes = giro.dias.filter(d => d.dia.startsWith(prefixo))
  const lotes = doMes.reduce((s, d) => s + d.lotes, 0)
  return { operados: doMes.length, mediaPorDia: doMes.length ? lotes / doMes.length : 0, lotes }
}

// ── Como opera: plataformas e modos, pela fatia dos lotes do extrato ─────────
export type Fatia = { nome: string; lotes: number; pct: number }
export function fatias(extrato: ExtratoRow[], campo: 'plataforma' | 'modo'): Fatia[] {
  const soma = new Map<string, number>()
  let total = 0
  for (const l of extrato) {
    const lotes = l.lotes_operados + l.lotes_zerados
    if (lotes <= 0) continue
    const nome = (l[campo] ?? '').trim() || 'não informado'
    soma.set(nome, (soma.get(nome) ?? 0) + lotes)
    total += lotes
  }
  return [...soma.entries()].map(([nome, lotes]) => ({ nome, lotes, pct: total ? (lotes / total) * 100 : 0 })).sort((x, y) => y.lotes - x.lotes || x.nome.localeCompare(y.nome, 'pt-BR'))
}

// ── Aniversário ─────────────────────────────────────────────────────────────
// O próximo aniversário a partir de hoje: em quantos dias, a data (dd/mm) e a idade que completa
export function proximoAniversario(nascimento: string | null | undefined, hoje: string): { emDias: number; data: string; idade: number } | null {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}/.test(nascimento)) return null
  const anoNasc = Number(nascimento.slice(0, 4)), mes = nascimento.slice(5, 7), dia = nascimento.slice(8, 10)
  const anoHoje = Number(hoje.slice(0, 4))
  if (!anoNasc || anoNasc > anoHoje) return null
  // 29/02 em ano que não é bissexto comemora em 28/02
  const noAno = (ano: number) => (mes === '02' && dia === '29' && new Date(ano, 1, 29).getMonth() !== 1 ? `${ano}-02-28` : `${ano}-${mes}-${dia}`)
  let data = noAno(anoHoje)
  if (data < hoje) data = noAno(anoHoje + 1)
  return { emDias: diasEntre(hoje, data), data: `${data.slice(8, 10)}/${data.slice(5, 7)}`, idade: Number(data.slice(0, 4)) - anoNasc }
}
