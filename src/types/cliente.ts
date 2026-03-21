export type ClienteStatus = 'ativo' | 'inativo' | 'em_transferencia'
export type Classificacao = 'saudavel' | 'atencao' | 'risco'
export type Tendencia = 'subindo' | 'estavel' | 'caindo'
export type SegmentoCliente = 'ativo' | 'iniciante' | 'inativo' | 'perdeu_dinheiro'

export interface Cliente {
  id: string
  cpf: string
  nome: string
  email: string | null
  telefone: string | null
  data_nascimento: string | null
  sexo: 'masculino' | 'feminino' | 'outro' | null
  estado_civil: 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'uniao_estavel' | null
  estado: string | null
  perfil_investidor: 'conservador' | 'moderado' | 'arrojado' | 'agressivo' | null
  tipo_operacao: 'day_trade' | 'swing_trade' | 'position' | 'todos' | null
  corretora_origem: string | null
  assessor_id: string | null
  influenciador_id: string | null
  status: ClienteStatus
  observacoes: string | null
  // Genial import fields
  tipo_pessoa: string | null
  data_habilitacao: string | null
  patrimonio: number | null
  profissao: string | null
  perfil_genial: 'digital' | 'premium' | 'sem_informacao' | null
  situacao_conta: string | null
  created_at: string
  updated_at: string
  // joins
  assessor?: { nome: string } | null
  influenciador?: { nome: string; codigo: string } | null
  ultimo_score?: ClienteScore | null
  contas?: ClienteConta[]
}

export interface ClienteConta {
  id: string
  cliente_id: string
  numero_conta: string
  data_abertura: string | null
  capital_alocado: number
  ativa: boolean
  observacoes: string | null
  created_at: string
}

export interface ClienteDadosCHS {
  id: string
  cliente_id: string
  ultima_operacao: string | null
  receita_periodo_atual: number
  receita_periodo_anterior: number
  volume_periodo_atual: number
  volume_periodo_anterior: number
  score_engajamento: number
  comportamento_risco: 'segue_regras' | 'oscila' | 'excesso_risco'
  lotes_girados_mes: number
  lotes_zerados_mes: number
  dias_operados_mes: number
  receita_acumulada: number
  updated_at: string
}

export interface ClienteHistoricoMensal {
  id: string
  cliente_id: string
  mes: string // YYYY-MM
  receita: number
  lotes_girados: number
  lotes_zerados: number
  dias_operados: number
  score: number | null
  created_at: string
}

export interface ClienteFollowup {
  id: string
  cliente_id: string
  agendado_para: string
  observacao: string | null
  status: 'pendente' | 'realizado' | 'cancelado'
  criado_por: string | null
  created_at: string
}

export interface ClienteScore {
  id: string
  cliente_id: string
  score_total: number
  score_atividade: number
  score_receita: number
  score_volume: number
  score_engajamento: number
  score_tempo: number
  score_risco: number
  classificacao: Classificacao
  tendencia: Tendencia
  created_at: string
}

export interface ClienteAcao {
  id: string
  cliente_id: string
  tipo: 'tarefa' | 'nutricao' | 'upsell'
  titulo: string
  descricao: string | null
  status: 'pendente' | 'em_andamento' | 'concluida' | 'ignorada'
  prioridade: 'alta' | 'media' | 'baixa'
  created_at: string
}

export interface ClienteNota {
  id: string
  cliente_id: string
  autor_id: string | null
  conteudo: string
  created_at: string
  autor?: { nome: string } | null
}

export interface CHSInput {
  ultima_operacao: string | null
  receita_periodo_atual: number
  receita_periodo_anterior: number
  volume_periodo_atual: number
  volume_periodo_anterior: number
  score_engajamento: number
  comportamento_risco: 'segue_regras' | 'oscila' | 'excesso_risco'
  data_primeiro_relacionamento: string
  score_anterior?: number | null
}

export interface CHSResult {
  score_total: number
  score_atividade: number
  score_receita: number
  score_volume: number
  score_engajamento: number
  score_tempo: number
  score_risco: number
  classificacao: Classificacao
  tendencia: Tendencia
  acoes: { tipo: 'tarefa' | 'nutricao' | 'upsell'; titulo: string; descricao: string; prioridade: 'alta' | 'media' | 'baixa' }[]
}
