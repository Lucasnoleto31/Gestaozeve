export type Role = 'admin' | 'vendedor' | 'influenciador'

export interface Profile {
  id: string
  user_id: string
  nome: string
  email: string
  role: Role
  ativo: boolean
  created_at: string
}

export interface Influenciador {
  id: string
  user_id: string
  profile_id: string
  codigo: string
  nome: string
  total_leads?: number
  total_convertidos?: number
  created_at: string
}

export interface FunilEtapa {
  id: string
  nome: string
  ordem: number
  cor: string
}

export interface Script {
  id: string
  etapa_id: string
  titulo: string
  conteudo: string
  ordem: number
  etapa?: FunilEtapa
}

export type LeadStatus = 'ativo' | 'convertido' | 'perdido'
export type LeadTemperatura = 'quente' | 'morno' | 'frio'

export interface Lead {
  id: string
  nome: string
  email: string
  telefone: string
  origem: string
  influenciador_id: string | null
  vendedor_id: string | null
  etapa_id: string
  status: LeadStatus
  temperatura: LeadTemperatura | null
  motivo_perda: string | null
  observacoes: string | null
  created_at: string
  etapa?: FunilEtapa
  influenciador?: Influenciador
  vendedor?: Profile
}

export interface LeadNota {
  id: string
  lead_id: string
  autor_id: string | null
  conteudo: string
  created_at: string
  autor?: { nome: string } | null
}

export interface LeadHistorico {
  id: string
  lead_id: string
  etapa_anterior_id: string | null
  etapa_nova_id: string
  vendedor_id: string
  observacao: string | null
  created_at: string
  etapa_nova?: FunilEtapa
  vendedor?: Profile
}
