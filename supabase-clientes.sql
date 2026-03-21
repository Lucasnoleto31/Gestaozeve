-- =============================================
-- ZeveAI — Módulo Clientes + CHS
-- Execute no SQL Editor do Supabase
-- =============================================

-- 1. Clientes (único por CPF)
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  data_nascimento DATE,
  sexo TEXT CHECK (sexo IN ('masculino', 'feminino', 'outro')),
  estado_civil TEXT CHECK (estado_civil IN ('solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel')),
  estado TEXT,
  perfil_investidor TEXT CHECK (perfil_investidor IN ('conservador', 'moderado', 'arrojado', 'agressivo')),
  tipo_operacao TEXT CHECK (tipo_operacao IN ('day_trade', 'swing_trade', 'position', 'todos')),
  corretora_origem TEXT,
  assessor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  influenciador_id UUID REFERENCES public.influenciadores(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'em_transferencia')),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Contas na Genial (um cliente pode ter várias)
CREATE TABLE IF NOT EXISTS public.cliente_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  numero_conta TEXT NOT NULL,
  data_abertura DATE,
  capital_alocado NUMERIC(15,2) DEFAULT 0,
  ativa BOOLEAN DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Dados operacionais para cálculo do CHS (atualizado pelo assessor)
CREATE TABLE IF NOT EXISTS public.cliente_dados_chs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ultima_operacao DATE,
  receita_periodo_atual NUMERIC(15,2) DEFAULT 0,
  receita_periodo_anterior NUMERIC(15,2) DEFAULT 0,
  volume_periodo_atual NUMERIC(15,2) DEFAULT 0,
  volume_periodo_anterior NUMERIC(15,2) DEFAULT 0,
  score_engajamento INTEGER DEFAULT 50 CHECK (score_engajamento BETWEEN 0 AND 100),
  comportamento_risco TEXT DEFAULT 'segue_regras' CHECK (comportamento_risco IN ('segue_regras', 'oscila', 'excesso_risco')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Histórico de scores (para tendência)
CREATE TABLE IF NOT EXISTS public.cliente_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  score_total NUMERIC(5,2) NOT NULL,
  score_atividade NUMERIC(5,2),
  score_receita NUMERIC(5,2),
  score_volume NUMERIC(5,2),
  score_engajamento NUMERIC(5,2),
  score_tempo NUMERIC(5,2),
  score_risco NUMERIC(5,2),
  classificacao TEXT NOT NULL CHECK (classificacao IN ('saudavel', 'atencao', 'risco')),
  tendencia TEXT DEFAULT 'estavel' CHECK (tendencia IN ('subindo', 'estavel', 'caindo')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Ações automáticas geradas pelo CHS
CREATE TABLE IF NOT EXISTS public.cliente_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('tarefa', 'nutricao', 'upsell')),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'ignorada')),
  prioridade TEXT DEFAULT 'media' CHECK (prioridade IN ('alta', 'media', 'baixa')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Notas / histórico de interações
CREATE TABLE IF NOT EXISTS public.cliente_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  autor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  conteudo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS
-- =============================================
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_dados_chs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_notas ENABLE ROW LEVEL SECURITY;

-- Policies: admin e vendedor acessam tudo
DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
DROP POLICY IF EXISTS "clientes_delete" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'vendedor'));
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));
CREATE POLICY "clientes_delete" ON public.clientes FOR DELETE TO authenticated USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "contas_all" ON public.cliente_contas;
DROP POLICY IF EXISTS "dados_chs_all" ON public.cliente_dados_chs;
DROP POLICY IF EXISTS "scores_all" ON public.cliente_scores;
DROP POLICY IF EXISTS "acoes_all" ON public.cliente_acoes;
DROP POLICY IF EXISTS "notas_all" ON public.cliente_notas;
CREATE POLICY "contas_all" ON public.cliente_contas FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));
CREATE POLICY "dados_chs_all" ON public.cliente_dados_chs FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));
CREATE POLICY "scores_all" ON public.cliente_scores FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));
CREATE POLICY "acoes_all" ON public.cliente_acoes FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));
CREATE POLICY "notas_all" ON public.cliente_notas FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));

-- =============================================
-- Grants
-- =============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_contas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_dados_chs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_acoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_notas TO authenticated;

-- =============================================
-- Trigger: updated_at em clientes
-- =============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clientes_updated_at ON public.clientes;
CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
