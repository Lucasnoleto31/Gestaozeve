// Busca de pessoas (leads e clientes) por nome, telefone, CPF/CNPJ, e-mail ou conta.
// Vale no navegador (filtro das tabelas) e no servidor (busca rápida de cliente).
//
// - Nome: sem acento, sem diferença de maiúsculas, sem apóstrofo, palavras em qualquer ordem
//   ("vitor miranda" acha "Vitor Gomes Miranda"; "davila" acha "D'Ávila").
// - Telefone: aceita qualquer formato ("(11) 98733-8596", "+55 11 98733-8596", "11987338596",
//   "98733-8596", "0xx11 98733-8596", colado do WhatsApp com caracteres invisíveis); o 55 do país e
//   o 0 de discagem são ignorados. Com DDD, compara DDD + 8 últimos dígitos (acha o mesmo número com
//   ou sem o 9 na frente); sem DDD de um dos lados, os 8 últimos; pedaço a partir de 4 dígitos.
// - CPF/CNPJ e conta: com ou sem pontuação, em qualquer parte (a partir de 3 dígitos); conta ignora
//   zeros à esquerda.
// - E-mail: inteiro ou só um pedaço.
// - Termos misturados valem juntos: "vitor 8596" = nome tem VITOR e algum número tem 8596;
//   "vitor +55 11 98733-8596" junta os números seguidos num telefone só.
// - Rótulos ("CPF: 084…", "tel:1198…", "nº 123"), pontuação nas pontas e parênteses em volta de nome
//   ou e-mail são ignorados. Data ("12/10") procura só no texto (observações).
import { normTexto } from './texto'

export type TokenBusca = {
  tipo: 'texto' | 'digitos' | 'email'
  valor: string
  partes?: string[]       // dígitos: os números separados que foram juntados ("55", "11", "987338596")
  bruto?: string          // dígitos: como foi digitado, para achar em texto ("12/10", "5.000")
  noTexto?: boolean       // dígitos: também pode casar no texto (termo misturado, número curto, valor)
  soTexto?: boolean       // dígitos: é uma data ("5/10", "12/10/2026") — só procura no texto
}
export type TermoBusca = { tokens: TokenBusca[] }
export type IndiceBusca = { texto: string; telefones: string[]; fonesBrutos: string[]; documentos: string[]; contas: string[]; emails: string[] }
export type CamposBusca = {
  textos?: (string | null | undefined)[]
  telefones?: (string | null | undefined)[]
  documentos?: (string | null | undefined)[]
  contas?: (string | null | undefined)[]
  emails?: (string | null | undefined)[]
}

export const soDigitos = (s: string | null | undefined) => String(s ?? '').replace(/\D+/g, '')
const NUMERICO = /^[\d.\-()/+]+$/          // um pedaço só de número e pontuação de número
const SO_PONTUACAO = /^[^\p{L}\p{N}@]+$/u  // pedaço sem letra, número nem @ ("-", "–", "|", ",")
const DATA = /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/
const ROTULOS = new Set(['CPF', 'CNPJ', 'DOC', 'TEL', 'TELEFONE', 'FONE', 'CEL', 'CELULAR', 'WHATSAPP', 'WHATS', 'WPP', 'ZAP', 'EMAIL', 'E-MAIL', 'MAIL', 'CONTA', 'NUMERO', 'NUM', 'NO', 'N', 'Nº', 'N°'])
// rótulo colado no número, sem espaço ("CPF:084…", "tel:1198…", "nº123", "CPF/CNPJ:084…")
const ROT = '(?:cpf|cnpj|doc|telefone|tel|fone|celular|cel|whatsapp|whats|wpp|zap|conta|numero|num|n[º°o]?|e-?mail)'
const ROTULO_COLADO = new RegExp(`^(${ROT}(?:[/-]${ROT})*)([:.#º°]*)(?=[\\d(+])`, 'i')
// "CPF/CNPJ", "TEL-CEL": todas as partes são rótulos
const ehRotulo = (v: string) => ROTULOS.has(v) || v.split(/[/-]/).filter(Boolean).every(x => ROTULOS.has(x))

// Texto da busca e do índice: o normTexto do sistema (maiúsculo, sem acento) sem apóstrofos
export function normBusca(s: string | null | undefined): string {
  return normTexto(s).replace(/['’‘`´]/g, '')
}

// Limpa o que vem colado: caracteres invisíveis (WhatsApp, Contatos), travessões, dígitos/letras de largura
// total e letras estilizadas de perfil (𝐕𝐢𝐭𝐨𝐫). Não usa NFKC no termo todo: ele trocaria "Mª"/"1º" e o
// índice não teria a troca.
function limparEntrada(s: string): string {
  return s.replace(/\p{Cf}/gu, '').replace(/[‐-―−﹘﹣]/g, '-')
    .replace(/[！-～]/g, ch => ch.normalize('NFKC')).replace(/[\u{1D400}-\u{1D7FF}]/gu, ch => ch.normalize('NFKC'))
    .replace(/　/g, ' ').trim()
}

// Telefone em dígitos nacionais: tira o 55 do país e o 0 de discagem (com ou sem código de operadora)
export function digitosTelefone(s: string | null | undefined): string {
  let d = soDigitos(s)
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length >= 11 && d.startsWith('0')) {
    d = d.slice(1)
    if (d.length >= 12) d = d.slice(2)   // 0 + operadora + DDD + número
  }
  return d
}

// O telefone guardado `p` (já em dígitos nacionais) corresponde ao que foi digitado?
export function casaTelefone(p: string, digitado: string): boolean {
  const d = digitosTelefone(digitado)
  if (!p || d.length < 4) return false
  if (p.includes(d)) return true
  // "+55 11 987…" ainda incompleto: tenta sem o 55 (sem tirar a alternativa com 55, que pode ser o DDD 55)
  if (d.startsWith('55') && d.length < 12 && d.length >= 6 && p.startsWith(d.slice(2))) return true
  if (d.length >= 10) {
    // guardado sem DDD: não há DDD para comparar, valem os 8 últimos
    if (p.length >= 8 && p.length < 10) return p.slice(-8) === d.slice(-8)
    return p.length >= 10 && p.slice(0, 2) === d.slice(0, 2) && p.slice(-8) === d.slice(-8)
  }
  if (d.length >= 8) return p.slice(-8) === d.slice(-8)
  return false
}

const semZerosEsq = (s: string) => s.replace(/^0+(?=\d)/, '')
const ehNumerico = (s: string) => NUMERICO.test(s) && /\d/.test(s)
// número: mantém "(" e ")" nas pontas, por causa do DDD "(11)"; texto e e-mail: tira toda pontuação das pontas
function tiraPontas(s: string): string {
  const numero = s.replace(/^[^\p{L}\p{N}@+(]+/u, '').replace(/[^\p{L}\p{N})]+$/u, '')
  if (ehNumerico(numero)) return numero
  return s.replace(/^[^\p{L}\p{N}@]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '')
}
// "0xx11…" → "011…" só em pedaço de número (não mexe em e-mail nem nome com "xx")
function tiraXx(p: string): string {
  const q = p.replace(/^(\(?)0?xx(?=\d)/i, '$10')
  return q !== p && ehNumerico(q) ? q : p
}
// valor (5.000), mês/ano (10/2026), CNPJ com barra ou número curto (18): procura também no texto (observações, assessor)
const procuraNoTexto = (bruto: string, digitos: string) => digitos.length < 3 || /[/,]/.test(bruto) || /^\d{1,3}(\.\d{3})+$/.test(bruto)

function tokenDigitos(partes: string[], misturado: boolean): TokenBusca {
  const bruto = partes.join(' ')
  const valor = partes.map(soDigitos).join('')
  const soTexto = partes.length === 1 && DATA.test(bruto)
  return {
    tipo: 'digitos', valor, bruto: normBusca(bruto),
    partes: partes.length > 1 ? partes.map(soDigitos).filter(Boolean) : undefined,
    noTexto: soTexto || misturado || procuraNoTexto(bruto, valor),
    soTexto: soTexto || undefined,
  }
}

// Separa o rótulo colado do número ("CPF:084.386" → "CPF", "084.386"; "(tel:0xx11…)"); e-mail perde o
// rótulo ("E-mail:ana@x.com"). Sem separador só quando o número é longo: "conta2020" e "n1990" ficam texto.
function separarRotulo(p0: string): string[] {
  const p = tiraPontas(p0)
  if (p.includes('@')) return [p.replace(/^(mailto|e-?mail|mail)[:.]+/i, '')]
  const m = p.match(ROTULO_COLADO)
  if (!m) return [p0]
  const resto = tiraXx(tiraPontas(p.slice(m[0].length)))
  if (!resto || !ehNumerico(resto)) return [p0]
  const temSeparador = m[2].length > 0 || /[º°]$/.test(m[1])
  return temSeparador || soDigitos(resto).length >= 8 ? [m[1], resto] : [p0]
}

export function lerBusca(termo: string | null | undefined): TermoBusca | null {
  const t = limparEntrada(String(termo ?? ''))
  if (!t) return null
  const pedacos = t.split(/\s+/).flatMap(separarRotulo).map(tiraPontas).map(tiraXx).filter(p => p && !SO_PONTUACAO.test(p))
  if (!pedacos.length) return null
  // só número com pontuação ("(11) 98733-8596", "084.386.906-29", "+55 11 98733 8596"): um termo só
  if (pedacos.every(ehNumerico)) return { tokens: [tokenDigitos(pedacos, false)] }

  const tokens: TokenBusca[] = []
  let numeros: string[] = []
  const fechaNumeros = () => { if (numeros.length) { tokens.push(tokenDigitos(numeros, true)); numeros = [] } }
  for (const parte of pedacos) {
    if (ehNumerico(parte)) { numeros.push(parte); continue }   // números seguidos viram um token só
    fechaNumeros()
    if (parte.includes('@')) { tokens.push({ tipo: 'email', valor: parte.toLowerCase().replace(/^(mailto|e-?mail|mail)[:.]+/, '') }); continue }
    const v = normBusca(parte)
    if (v) tokens.push({ tipo: 'texto', valor: v })
  }
  fechaNumeros()
  // "CPF 084…", "tel (11) 9…": o rótulo não precisa casar quando vem junto com um número ou e-mail
  const temDado = tokens.some(k => k.tipo !== 'texto')
  const uteis = temDado ? tokens.filter(k => !(k.tipo === 'texto' && ehRotulo(k.valor))) : tokens
  return uteis.length ? { tokens: uteis } : null
}

// Regex (POSIX, para o imatch do banco) de um token de texto: o token inteiro, com os caracteres especiais
// escapados e um apóstrofo opcional entre as letras ("DAVILA" acha "D'AVILA"; "Mª" e "JOAO-PEDRO" ficam inteiros)
export function regexDoTexto(tk: TokenBusca): string | null {
  if (tk.tipo !== 'texto' || !tk.valor) return null
  return Array.from(tk.valor).map(ch => ch.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&')).join("['’‘`´]?")
}

export function indexarBusca(c: CamposBusca): IndiceBusca {
  const limpos = (xs?: (string | null | undefined)[]) => (xs ?? []).filter((x): x is string => !!x && String(x).trim() !== '')
  const emails = limpos(c.emails).map(e => e.trim().toLowerCase())
  const fones = limpos(c.telefones)
  return {
    texto: [...limpos(c.textos), ...emails].map(normBusca).join(' | '),
    telefones: fones.map(digitosTelefone).filter(Boolean),
    fonesBrutos: fones.map(soDigitos).filter(Boolean),
    documentos: limpos(c.documentos).map(soDigitos).filter(Boolean),
    contas: limpos(c.contas).map(x => semZerosEsq(soDigitos(x))).filter(Boolean),
    emails,
  }
}

function casaNumero(d: string, ix: IndiceBusca): boolean {
  if (!d) return false
  if (d.length >= 3 && ix.documentos.some(x => x.includes(d))) return true
  if (d.length >= 4 && ix.fonesBrutos.some(x => x.includes(d))) return true
  if (ix.telefones.some(p => casaTelefone(p, d))) return true
  const dc = semZerosEsq(d)
  return dc.length >= 3 && ix.contas.some(x => x.includes(dc))
}

// A conta digitada (ou uma das partes) está nesta conta? Serve para mostrar a conta certa no resultado.
export function contaCasa(tk: TokenBusca, conta: string): boolean {
  if (tk.tipo !== 'digitos' || tk.soTexto) return false
  const c = semZerosEsq(soDigitos(conta))
  return [tk.valor, ...(tk.partes ?? [])].some(d => { const dc = semZerosEsq(d); return dc.length >= 3 && c.includes(dc) })
}

export function casaToken(tk: TokenBusca, ix: IndiceBusca): boolean {
  if (tk.tipo === 'texto') return ix.texto.includes(tk.valor)
  if (tk.tipo === 'email') return ix.emails.some(e => e.includes(tk.valor)) || ix.texto.includes(normBusca(tk.valor))
  if (tk.soTexto) return !!tk.bruto && ix.texto.includes(tk.bruto)
  if (casaNumero(tk.valor, ix)) return true
  // números separados ("8596 2757672"): cada um casando em algum lugar também vale
  if (tk.partes && tk.partes.length > 1 && tk.partes.every(p => casaNumero(p, ix) || (tk.noTexto && ix.texto.includes(p)))) return true
  if (!tk.noTexto) return false
  return ix.texto.includes(tk.valor) || (!!tk.bruto && ix.texto.includes(tk.bruto))
}

// Sem termo, tudo casa. Com termo, cada palavra precisa casar em algum campo.
export function casaBusca(t: TermoBusca | null, ix: IndiceBusca): boolean {
  if (!t) return true
  return t.tokens.every(tk => casaToken(tk, ix))
}
