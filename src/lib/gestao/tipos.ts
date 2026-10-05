// Tipos das linhas devolvidas pelas funções do banco (supabase-s19) e das tabelas de parâmetros.
import type { Corretora } from '@/lib/corretoras'

export type StatusConta = 'Migrado' | 'Em processamento' | 'Recusou'
export type Situacao = 'Ativo' | 'Inativo' | 'Nunca girou' | 'Em processamento' | 'Recusou'

export type ClienteRow = {
  cliente_id: string
  nome: string
  documento: string | null
  telefone: string | null
  email: string | null
  uf: string | null
  perfil: string | null
  tipo_pessoa: string | null
  n_contas: number
  conta_principal: string | null
  status: StatusConta
  situacao_conta: string | null
  assessor_nome: string | null
  responsavel: string | null
  tarifa: number
  data_migracao: string | null
  data_entrada: string | null
  dias_ate_migrar: number | null
  lotes_total: number
  lotes_mes: number
  zerados_mes: number
  receita_mes: number
  receita_corretagem_mes: number
  receita_zeragem_mes: number
  lotes_12m: number
  receita_12m: number
  ultimo_giro: string | null
  ultimo_mes_giro: string | null
  meses_sem_giro: number | null
  situacao: Situacao
  alertas: string[]
  parceiro: string | null
  observacoes: string | null
  motivo_recusa: string | null
}

export type ContaRow = {
  conta_id: string
  conta: string
  conta_digito: string | null
  situacao_conta: string | null
  status: StatusConta
  assessor_nome: string | null
  filial: string | null
  data_habilitacao: string | null
  principal: boolean
  lotes: number
  lotes_12m: number
  zerados: number
  receita: number
  ultimo_giro: string | null
}

export type ClienteMensalRow = { mes_ref: string; lotes: number; zerados: number; receita: number; pontos: number }

export type ExtratoRow = {
  id: string
  data: string
  conta: string | null
  ativo: string | null
  produto: string | null
  plataforma: string | null
  modo: string | null
  lotes_operados: number
  lotes_zerados: number
  tarifa: number
  zeragem_rs: number
  receita_corretagem: number
  receita_zeragem: number
  pontos: number
  nome_cliente: string | null
}

export type PorAtivoRow = { ativo: string; lotes: number; zerados: number; receita: number; operacoes: number }

export type TarifaCliente = { id: string; vigencia: string; corretagem: number; observacao: string | null }

export type ClienteCadastro = {
  id: string
  nome: string
  documento: string | null
  tipo_pessoa: string | null
  sexo: string | null
  estado_civil: string | null
  uf: string | null
  profissao: string | null
  rendimentos: number | null
  patrimonio: number | null
  email: string | null
  telefone: string | null
  perfil: string | null
  perfil_suitability: string | null
  dt_nascimento: string | null
}

export type PainelKpis = {
  mes_ref: string
  clientes_levados: number
  total_contas: number
  migrados: number
  em_processamento: number
  recusaram: number
  ativos_mes: number
  lotes_mes: number
  zerados_mes: number
  receita_mes: number
  incentivo_mes: number
  clientes_com_faixa: number
  migrados_sem_giro: number
  inativos: number
  com_alertas: number
  migrados_sem_data: number
  multi_conta: number
  linhas_nao_cadastradas: number
  lotes_nao_cadastrados: number
  ultima_data: string | null
}

export type PainelMensalRow = {
  mes_ref: string
  migrados_acumulados: number
  novas_migracoes: number
  entradas: number
  clientes_ativos: number
  lotes: number
  zerados: number
  receita_corretagem: number
  receita_zeragem: number
  receita: number
  incentivo: number
  clientes_pontuando: number
  clientes_com_faixa: number
}

export type ClienteMesRow = { cliente_id: string; cliente_nome: string; responsavel: string | null; mes_ref: string; lotes: number }

export type LoteNaoCadastradoRow = {
  conta: string | null
  nome_cliente: string | null
  assessor_nome: string | null
  lotes: number
  linhas: number
  primeira: string | null
  ultima: string | null
}

export type MigracaoDiaRow = { dia: string; migrados: number; entradas: number; acumulado: number }

export type AssessorResumoRow = {
  assessor_nome: string
  responsavel: string | null
  tarifa: number | null
  tipo_zeragem: string | null
  clientes_ativos: number
  lotes: number
  zerados: number
  receita_corretagem: number
  receita_zeragem: number
  receita: number
  lotes_mes_anterior: number
  lotes_12m: number
  receita_12m: number
}

export type AssessorMensalRow = { mes_ref: string; assessor_nome: string; lotes: number; receita: number; clientes: number }

export type TopClienteRow = {
  cliente_id: string | null
  cliente_nome: string
  assessor_nome: string | null
  responsavel: string | null
  lotes: number
  zerados: number
  receita: number
  pct_lotes: number
}

export type IncentivoRow = {
  chave: string
  nome: string
  cliente_id: string | null
  contas: number
  lotes: number
  pontos: number
  pontos_win: number
  pontos_wdo: number
  pontos_dol: number
  pontos_outros: number
  faixa_min: number
  valor_incentivo: number
  proxima_faixa: number | null
  pontos_faltantes: number | null
}

export type IncentivoHistRow = { mes_ref: string; pontos: number; clientes_pontuando: number; clientes_com_faixa: number; incentivo: number }

export type DiarioRow = { dia: string; lotes: number; zerados: number; clientes: number; operacoes: number; receita: number }

export type MixPlataformaRow = { plataforma: string; lotes: number; zerados: number; clientes: number }

export type LeadRow = {
  id: string
  corretora: string | null
  data_hora: string
  nome: string
  whatsapp: string | null
  cpf: string | null
  email: string | null
  ja_opera: string | null
  origem: string | null
  responsavel: string | null
  status: string
  tipo_status: 'Aberto' | 'Fechado'
  ultimo_contato: string | null
  data_fechamento: string | null
  motivo_perda: string | null
  observacoes: string | null
  cliente_id: string | null
  cliente_nome: string | null
  cliente_status: string | null
  cliente_corretora: string | null
  conta: string | null
  girou: boolean
  lotes_12m: number
  dias: number | null
  alerta: boolean
}

export type FunilMensalRow = {
  mes_ref: string
  recebidos: number
  ja_clientes: number
  ganhos: number
  perdidos: number
  safra_ganhos: number
  safra_perdidos: number
  safra_abertos: number
  abertos_acumulado: number
  dias_fechar: number | null
}

export type FunilPorRow = {
  grupo: string
  leads: number
  ja_clientes: number
  abertos: number
  ganhos: number
  perdidos: number
  taxa_ganho: number
  conversao: number
  dias_fechar: number | null
  com_alerta: number
}

// Parâmetros
export type Parametro = { chave: string; valor: string; descricao: string | null }
export type AssessorParam = {
  id: string
  corretora: Corretora
  nome: string
  id_assessor: string | null
  corretagem: number
  tipo_zeragem: 'PADRAO' | 'FIXA'
  zeragem_fixa: number
  responsavel: string | null
  ativo: boolean
}
export type StatusContaMapa = { situacao: string; status: StatusConta }
export type Multiplicador = { produto: string; pontos: number }
export type Faixa = { pontos_min: number; valor: number }
export type Consolidado = { nome: string }
export type StatusLead = { status: string; tipo: 'Aberto' | 'Fechado'; ordem: number }
export type Responsavel = { nome: string; atende_clientes: boolean; atende_leads: boolean; ativo: boolean }
export type SituacaoNaoMapeada = { situacao: string; contas: number }
export type AssessorNaoCadastrado = { assessor_nome: string; contas: number; lotes: number }

export type Importacao = {
  id: string
  corretora: string
  tipo: 'clientes' | 'lotes' | 'leads'
  nome_arquivo: string
  linhas: number
  linhas_novas: number
  linhas_ignoradas: number
  data_min: string | null
  data_max: string | null
  detalhes: Record<string, unknown> | null
  criado_por_nome: string | null
  created_at: string
}

// Resultado padrão das server actions
export type Resultado<T = undefined> = { ok: true; dados: T } | { ok: false; erro: string }

// Campos editáveis de um lead (formulário)
export type LeadCampos = {
  nome: string; whatsapp: string | null; cpf: string | null; email: string | null; ja_opera: string | null; corretora: string | null
  origem: string | null; responsavel: string | null; status: string; ultimo_contato: string | null; data_fechamento: string | null
  motivo_perda: string | null; observacoes: string | null
}
