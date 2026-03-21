-- =============================================
-- ZeveAI — Receitas do Escritório
-- Execute no SQL Editor do Supabase
-- =============================================

-- 1. Lotes de importação (cada upload = 1 lote)
CREATE TABLE IF NOT EXISTS public.receitas_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo TEXT NOT NULL,
  total_linhas INTEGER DEFAULT 0,
  valor_liquido_total NUMERIC(15,2) DEFAULT 0,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Receitas (uma linha por registro do Excel)
CREATE TABLE IF NOT EXISTS public.receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID REFERENCES public.receitas_importacoes(id) ON DELETE CASCADE,
  -- Vínculos com entidades do sistema (nullable: nem sempre haverá match)
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  assessor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Dados brutos do Excel
  assessor_nome TEXT,
  tipo_produto TEXT,
  produto TEXT,
  cod_sinacor TEXT,
  cpf_cnpj TEXT,
  cliente_nome TEXT,
  data_receita DATE,
  -- Valores financeiros
  receita_genial NUMERIC(15,2) DEFAULT 0,
  repasse_aai NUMERIC(15,2) DEFAULT 0,
  repasse_assessor NUMERIC(15,2) DEFAULT 0,
  valor_bruto_aai NUMERIC(15,2) DEFAULT 0,
  imposto NUMERIC(15,2) DEFAULT 0,
  valor_liquido_aai NUMERIC(15,2) DEFAULT 0,
  comissao_assessor NUMERIC(15,2) DEFAULT 0,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS receitas_data_idx ON public.receitas(data_receita);
CREATE INDEX IF NOT EXISTS receitas_cliente_idx ON public.receitas(cliente_id);
CREATE INDEX IF NOT EXISTS receitas_assessor_idx ON public.receitas(assessor_id);
CREATE INDEX IF NOT EXISTS receitas_importacao_idx ON public.receitas(importacao_id);

-- RLS
ALTER TABLE public.receitas_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receitas_importacoes_admin" ON public.receitas_importacoes;
DROP POLICY IF EXISTS "receitas_admin" ON public.receitas;

CREATE POLICY "receitas_importacoes_admin" ON public.receitas_importacoes
  FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "receitas_admin" ON public.receitas
  FOR ALL TO authenticated USING (get_my_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receitas_importacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receitas TO authenticated;
