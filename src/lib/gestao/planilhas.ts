// Leitura dos exports das corretoras e do formulário de leads (puro: navegador e testes).
// Cada leitor recebe a matriz da planilha (1ª linha = cabeçalho) e devolve linhas tipadas
// já no formato que as funções importar_* do banco esperam.

import { normalizarChave, normalizarNome } from '@/lib/texto'

export function numeroBR(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value
  let s = String(value).trim().replace(/\s/g, '').replace(/^R\$/i, '')
  if (s === '') return 0
  const temVirgula = s.includes(',')
  const temPonto = s.includes('.')
  if (temVirgula && temPonto) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (temVirgula) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

// 'YYYY-MM-DD' ou '' — aceita serial do Excel, dd/mm/yyyy (com hora) e ISO
export function dataBR(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return ''
    return new Date(Math.round((value - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
  }
  const v = String(value).trim()
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[\sT,].*)?$/)
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3]
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[\sT].*)?$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return ''
}

// Data e hora → ISO com fuso de Brasília (ou '' quando não é data)
export function dataHoraBR(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString()
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return ''
    // serial do Excel é "hora local": devolve como horário de Brasília
    const ms = Math.round((value - 25569) * 86400 * 1000)
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}-03:00`
  }
  const v = String(value).trim()
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
    const hh = (m[4] ?? '0').padStart(2, '0'), mm = (m[5] ?? '0').padStart(2, '0'), ss = (m[6] ?? '0').padStart(2, '0')
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${hh}:${mm}:${ss}-03:00`
  }
  const d = dataBR(v)
  if (!d) return ''
  const hora = v.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  return hora ? `${d}T${hora[1].padStart(2, '0')}:${hora[2]}:${(hora[3] ?? '00')}-03:00` : `${d}T00:00:00-03:00`
}

export const texto = (v: unknown) => (v === null || v === undefined ? '' : normalizarNome(String(v)))
export const digitos = (v: unknown) => texto(v).replace(/\D/g, '')
// '' → null (o banco recebe null em datas/números vazios, nunca '')
export const ouNulo = (v: string) => (v === '' ? null : v)

// Converte um cabeçalho em chave de comparação ('Qtd. Contratos' → 'qtd. contratos')
const chave = (h: unknown) => normalizarChave(String(h ?? ''))

type Mapa<T extends string> = Record<T, string[]>   // campo → cabeçalhos aceitos (já normalizados)

function indices<T extends string>(headers: unknown[], mapa: Mapa<T>): Partial<Record<T, number>> {
  const hs = headers.map(chave)
  const out: Partial<Record<T, number>> = {}
  for (const campo of Object.keys(mapa) as T[]) {
    const i = hs.findIndex(h => mapa[campo].includes(h))
    if (i >= 0) out[campo] = i
  }
  return out
}

const linhaVazia = (row: unknown[]) => !row || !row.some(c => c !== null && c !== undefined && String(c).trim() !== '')

export type Leitura<T> = { ok: true; linhas: T[]; faltando: string[]; cabecalhos: string[] } | { ok: false; erro: string }

// Acha a linha de cabeçalho (os exports às vezes têm linhas de título antes dela)
function acharCabecalho(raw: unknown[][], pistas: string[]): number {
  for (let i = 0; i < Math.min(raw.length, 15); i++) {
    const hs = (raw[i] ?? []).map(chave)
    if (pistas.some(p => hs.includes(p))) return i
  }
  return 0
}

// ---------------------------------------------------------------------------
// 1. Export de clientes (25 colunas DT_PARTITION … ID_ASSESSOR) + colunas manuais do controle
// ---------------------------------------------------------------------------
export type ClienteImport = {
  conta: string
  conta_digito: string
  id_conta: string
  id_cliente: string
  nome: string
  documento: string
  assessor: string
  filial: string
  situacao_conta: string
  tipo_pessoa: string
  sexo: string
  estado_civil: string
  uf: string
  profissao: string
  rendimentos: number | null
  patrimonio: number | null
  email: string
  telefone: string
  perfil: string
  perfil_suitability: string
  dt_nascimento: string | null
  data_habilitacao: string | null
  soma_total: number | null
  id_assessor: string
  dt_partition: string | null
  // manuais (quando o arquivo é a própria aba Clientes do controle)
  data_entrada: string | null
  parceiro: string
  observacoes: string
  motivo_recusa: string
}

const MAPA_CLIENTES: Mapa<keyof ClienteImport> = {
  dt_partition: ['dt partition'],
  id_conta: ['id conta'],
  id_cliente: ['id cliente'],
  nome: ['nome cliente', 'cliente', 'nome'],
  conta: ['cd conta sem digito', 'conta', 'conta genial', 'conta xp', 'conta btg', 'conta sem digito', 'sinacor', 'n conta', 'numero da conta', 'numero conta', 'codigo', 'codigo do cliente'],
  conta_digito: ['cd conta com digito', 'conta com digito', 'conta c/ digito'],
  documento: ['cpf cnpj', 'cpf/cnpj', 'cpf', 'documento'],
  assessor: ['assessor', 'nome assessor'],
  filial: ['filial'],
  situacao_conta: ['situacao conta', 'situacao'],
  tipo_pessoa: ['tp pessoa', 'tipo pessoa'],
  sexo: ['sexo'],
  estado_civil: ['estado civil'],
  uf: ['uf'],
  profissao: ['profissao'],
  rendimentos: ['rendimentos', 'renda'],
  patrimonio: ['patrimonio'],
  email: ['email', 'e mail'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'contato'],
  perfil: ['perfil'],
  perfil_suitability: ['perfil suitability', 'suitability'],
  dt_nascimento: ['dt nasc', 'data nascimento', 'dt nascimento', 'nascimento'],
  data_habilitacao: ['data habilitacao', 'data de migracao', 'data migracao', 'migracao'],
  soma_total: ['soma total'],
  id_assessor: ['id assessor'],
  data_entrada: ['data de entrada', 'data entrada', 'entrada'],
  parceiro: ['parceiro'],
  observacoes: ['observacoes', 'observacao', 'obs'],
  motivo_recusa: ['motivo da recusa', 'motivo recusa', 'recusa'],
}
const MANUAIS_CLIENTE: (keyof ClienteImport)[] = ['data_entrada', 'parceiro', 'observacoes', 'motivo_recusa', 'conta_digito']

export function lerClientes(raw: unknown[][]): Leitura<ClienteImport> {
  if (!raw || raw.length < 2) return { ok: false, erro: 'Planilha vazia ou sem dados.' }
  const h = acharCabecalho(raw, ['cd conta sem digito', 'nome cliente', 'cpf cnpj'])
  const cab = raw[h] ?? []
  const idx = indices(cab, MAPA_CLIENTES)
  if (idx.nome === undefined && idx.conta === undefined && idx.conta_digito === undefined) {
    return { ok: false, erro: `Não encontrei a coluna do nome (NOME_CLIENTE) nem a da conta (CD_CONTA_SEM_DIGITO). Cabeçalhos lidos: ${cab.map(texto).filter(Boolean).join(', ')}` }
  }
  const g = (row: unknown[], c: keyof ClienteImport) => (idx[c] === undefined ? undefined : row[idx[c]!])
  const linhas: ClienteImport[] = []
  for (const row of raw.slice(h + 1)) {
    if (linhaVazia(row)) continue
    const contaCom = digitos(g(row, 'conta_digito'))
    let conta = digitos(g(row, 'conta'))
    if (!conta && contaCom) conta = contaCom.slice(0, -1)   // sem o dígito verificador
    const nome = texto(g(row, 'nome'))
    if (!conta && !nome) continue   // a conta é opcional (lista própria): casa por CPF, telefone ou nome
    const rend = g(row, 'rendimentos'), patr = g(row, 'patrimonio'), soma = g(row, 'soma_total')
    linhas.push({
      conta,
      conta_digito: contaCom,
      id_conta: texto(g(row, 'id_conta')),
      id_cliente: texto(g(row, 'id_cliente')),
      nome,
      documento: digitos(g(row, 'documento')),
      assessor: texto(g(row, 'assessor')),
      filial: texto(g(row, 'filial')),
      situacao_conta: texto(g(row, 'situacao_conta')).toUpperCase(),
      tipo_pessoa: texto(g(row, 'tipo_pessoa')),
      sexo: texto(g(row, 'sexo')),
      estado_civil: texto(g(row, 'estado_civil')),
      uf: texto(g(row, 'uf')).toUpperCase(),
      profissao: texto(g(row, 'profissao')),
      rendimentos: texto(rend) === '' ? null : numeroBR(rend),
      patrimonio: texto(patr) === '' ? null : numeroBR(patr),
      email: texto(g(row, 'email')).toLowerCase(),
      telefone: texto(g(row, 'telefone')),
      perfil: texto(g(row, 'perfil')),
      perfil_suitability: texto(g(row, 'perfil_suitability')),
      dt_nascimento: ouNulo(dataBR(g(row, 'dt_nascimento'))),
      data_habilitacao: ouNulo(dataBR(g(row, 'data_habilitacao'))),
      soma_total: texto(soma) === '' ? null : numeroBR(soma),
      id_assessor: texto(g(row, 'id_assessor')),
      dt_partition: ouNulo(dataBR(g(row, 'dt_partition'))),
      data_entrada: ouNulo(dataBR(g(row, 'data_entrada'))),
      parceiro: texto(g(row, 'parceiro')),
      observacoes: texto(g(row, 'observacoes')),
      motivo_recusa: texto(g(row, 'motivo_recusa')),
    })
  }
  const faltando = (Object.keys(MAPA_CLIENTES) as (keyof ClienteImport)[])
    .filter(c => idx[c] === undefined && !MANUAIS_CLIENTE.includes(c))
  return { ok: true, linhas, faltando, cabecalhos: cab.map(texto) }
}

// ---------------------------------------------------------------------------
// 2. Export de lotes: 9 colunas (Sinacor, ID Assessor, Assessor, Filial, Ativo, Data,
//    Qtd. Contratos, Plataforma, Modo) ou 13 colunas (ID_CLIENTE, CD_CONTA_COM_DIGITO,
//    TP_PESSOA, SUPER_PNP, ID_ASSESSOR_HISTORICO, ID_FILIAL_HISTORICO, DATA_CONTRATO,
//    ATIVO, MODO, QTD_CONTRATOS, PLATAFORMA, NOME_ASSESSOR_HISTORICO, NOME_CLIENTE)
// ---------------------------------------------------------------------------
export type LoteImport = {
  data: string
  conta: string
  id_cliente: string
  id_assessor: string
  assessor: string
  filial: string
  ativo: string
  modo: string
  qtd: number
  plataforma: string
  nome_cliente: string
  tipo_pessoa: string
}

const MAPA_LOTES: Mapa<keyof LoteImport> = {
  data: ['data', 'data contrato', 'data pregao', 'dt', 'dt pregao'],
  conta: ['sinacor', 'conta', 'cd conta com digito', 'cd conta sem digito', 'numero conta', 'conta genial', 'conta c/ digito'],
  id_cliente: ['id cliente'],
  id_assessor: ['id assessor', 'id assessor historico'],
  assessor: ['assessor', 'nome assessor', 'nome assessor historico'],
  filial: ['filial', 'id filial historico', 'nome filial'],
  ativo: ['ativo', 'produto', 'papel'],
  modo: ['modo'],
  qtd: ['qtd. contratos', 'qtd contratos', 'qtd', 'quantidade', 'contratos', 'lotes'],
  plataforma: ['plataforma'],
  nome_cliente: ['nome cliente', 'cliente'],
  tipo_pessoa: ['tp pessoa', 'tipo pessoa'],
}
const OPCIONAIS_LOTE: (keyof LoteImport)[] = ['id_cliente', 'nome_cliente', 'tipo_pessoa', 'filial', 'id_assessor', 'modo', 'plataforma']

export function lerLotes(raw: unknown[][]): Leitura<LoteImport> {
  if (!raw || raw.length < 2) return { ok: false, erro: 'Planilha vazia ou sem dados.' }
  const h = acharCabecalho(raw, ['sinacor', 'data contrato', 'qtd. contratos', 'qtd contratos', 'ativo'])
  const cab = raw[h] ?? []
  const idx = indices(cab, MAPA_LOTES)
  const obrig: (keyof LoteImport)[] = ['conta', 'ativo', 'data', 'qtd']
  const semColuna = obrig.filter(c => idx[c] === undefined)
  if (semColuna.length) {
    return { ok: false, erro: `Faltam colunas obrigatórias (${semColuna.join(', ')}). Cabeçalhos lidos: ${cab.map(texto).filter(Boolean).join(', ')}` }
  }
  const g = (row: unknown[], c: keyof LoteImport) => (idx[c] === undefined ? undefined : row[idx[c]!])
  const linhas: LoteImport[] = []
  for (const row of raw.slice(h + 1)) {
    if (linhaVazia(row)) continue
    const data = dataBR(g(row, 'data'))
    const conta = digitos(g(row, 'conta'))
    if (!data || !conta) continue
    linhas.push({
      data,
      conta,
      id_cliente: texto(g(row, 'id_cliente')),
      id_assessor: texto(g(row, 'id_assessor')),
      assessor: texto(g(row, 'assessor')),
      filial: texto(g(row, 'filial')),
      ativo: texto(g(row, 'ativo')).toUpperCase(),
      modo: texto(g(row, 'modo')).toUpperCase(),
      qtd: numeroBR(g(row, 'qtd')),
      plataforma: texto(g(row, 'plataforma')).toUpperCase(),
      nome_cliente: texto(g(row, 'nome_cliente')),
      tipo_pessoa: texto(g(row, 'tipo_pessoa')),
    })
  }
  const faltando = (Object.keys(MAPA_LOTES) as (keyof LoteImport)[]).filter(c => idx[c] === undefined && !OPCIONAIS_LOTE.includes(c))
  return { ok: true, linhas, faltando, cabecalhos: cab.map(texto) }
}

// Resumo do arquivo de lotes (preview antes de importar)
export function resumoLotes(linhas: LoteImport[], modoZeragem = 'ZERAGEM') {
  let operados = 0, zerados = 0
  let dataMin = '', dataMax = ''
  const contas = new Set<string>()
  const dias = new Set<string>()
  const chaves = new Map<string, number>()
  for (const l of linhas) {
    const z = l.modo.includes(modoZeragem.toUpperCase())
    if (z) zerados += l.qtd; else operados += l.qtd
    contas.add(l.conta)
    dias.add(l.data)
    if (!dataMin || l.data < dataMin) dataMin = l.data
    if (!dataMax || l.data > dataMax) dataMax = l.data
    const k = `${l.data}|${l.conta}|${l.ativo}|${l.modo}|${l.qtd}|${l.plataforma}`
    chaves.set(k, (chaves.get(k) ?? 0) + 1)
  }
  let repetidas = 0
  for (const n of chaves.values()) if (n > 1) repetidas += n - 1
  return { linhas: linhas.length, operados, zerados, contas: contas.size, dias: dias.size, dataMin, dataMax, repetidas }
}

// ---------------------------------------------------------------------------
// 3. Leads: export do formulário (Data/Hora, Nome, WhatsApp, CPF, Email, Já opera?, Corretora)
//    + colunas da equipe (Origem/Parceiro, Responsável, Status, Último Contato, Data do
//    Fechamento, Motivo da Perda, Observações), quando vêm da planilha antiga
// ---------------------------------------------------------------------------
export type LeadImport = {
  data_hora: string
  nome: string
  whatsapp: string
  cpf: string
  email: string
  ja_opera: string
  corretora: string
  origem: string
  responsavel: string
  status: string
  ultimo_contato: string | null
  data_fechamento: string | null
  motivo_perda: string
  observacoes: string
}

const MAPA_LEADS: Mapa<keyof LeadImport> = {
  data_hora: ['data/hora', 'data hora', 'data', 'carimbo de data/hora', 'timestamp', 'data e hora'],
  nome: ['nome', 'nome completo'],
  whatsapp: ['whatsapp', 'telefone', 'celular'],
  cpf: ['cpf', 'cpf/cnpj', 'cpf cnpj'],
  email: ['email', 'e mail'],
  ja_opera: ['ja opera?', 'ja opera', 'opera'],
  corretora: ['corretora'],
  origem: ['origem / parceiro', 'origem/parceiro', 'origem parceiro', 'origem', 'parceiro'],
  responsavel: ['responsavel'],
  status: ['status'],
  ultimo_contato: ['ultimo contato'],
  data_fechamento: ['data do fechamento', 'data fechamento', 'fechamento'],
  motivo_perda: ['motivo da perda', 'motivo perda'],
  observacoes: ['observacoes', 'observacao', 'obs'],
}
const EQUIPE_LEAD: (keyof LeadImport)[] = ['origem', 'responsavel', 'status', 'ultimo_contato', 'data_fechamento', 'motivo_perda', 'observacoes']

export function lerLeads(raw: unknown[][]): Leitura<LeadImport> {
  if (!raw || raw.length < 2) return { ok: false, erro: 'Planilha vazia ou sem dados.' }
  const h = acharCabecalho(raw, ['data/hora', 'whatsapp', 'ja opera?'])
  const cab = raw[h] ?? []
  const idx = indices(cab, MAPA_LEADS)
  if (idx.nome === undefined || idx.data_hora === undefined) {
    return { ok: false, erro: `Não encontrei as colunas Data/Hora e Nome. Cabeçalhos lidos: ${cab.map(texto).filter(Boolean).join(', ')}` }
  }
  const g = (row: unknown[], c: keyof LeadImport) => (idx[c] === undefined ? undefined : row[idx[c]!])
  const linhas: LeadImport[] = []
  for (const row of raw.slice(h + 1)) {
    if (linhaVazia(row)) continue
    const nome = texto(g(row, 'nome'))
    const dataHora = dataHoraBR(g(row, 'data_hora'))
    if (!nome || !dataHora) continue
    linhas.push({
      data_hora: dataHora,
      nome,
      whatsapp: texto(g(row, 'whatsapp')),
      cpf: texto(g(row, 'cpf')),
      email: texto(g(row, 'email')).toLowerCase(),
      ja_opera: texto(g(row, 'ja_opera')),
      corretora: texto(g(row, 'corretora')),
      origem: texto(g(row, 'origem')),
      responsavel: texto(g(row, 'responsavel')),
      status: texto(g(row, 'status')),
      ultimo_contato: ouNulo(dataBR(g(row, 'ultimo_contato'))),
      data_fechamento: ouNulo(dataBR(g(row, 'data_fechamento'))),
      motivo_perda: texto(g(row, 'motivo_perda')),
      observacoes: texto(g(row, 'observacoes')),
    })
  }
  const faltando = (Object.keys(MAPA_LEADS) as (keyof LeadImport)[]).filter(c => idx[c] === undefined && !EQUIPE_LEAD.includes(c))
  return { ok: true, linhas, faltando, cabecalhos: cab.map(texto) }
}
