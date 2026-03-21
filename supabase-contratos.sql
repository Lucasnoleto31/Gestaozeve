-- =============================================
-- ZeveAI — Contratos Girados/Zerados
-- Execute no SQL Editor do Supabase
-- =============================================

-- 1. Lotes de importação
CREATE TABLE IF NOT EXISTS public.contratos_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo TEXT NOT NULL,
  total_linhas INTEGER DEFAULT 0,
  total_lotes_operados NUMERIC(15,2) DEFAULT 0,
  total_lotes_zerados NUMERIC(15,2) DEFAULT 0,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Contratos (uma linha por registro do Excel)
CREATE TABLE IF NOT EXISTS public.contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID REFERENCES public.contratos_importacoes(id) ON DELETE CASCADE,
  -- Vínculos com entidades do sistema
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  assessor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Dados brutos do Excel
  data DATE,
  numero_conta TEXT,
  cpf TEXT,
  cnpj TEXT,
  cliente_nome TEXT,
  assessor_nome TEXT,
  ativo TEXT,
  plataforma TEXT,
  lotes_operados NUMERIC(15,2) DEFAULT 0,
  lotes_zerados NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS contratos_data_idx ON public.contratos(data);
CREATE INDEX IF NOT EXISTS contratos_cliente_idx ON public.contratos(cliente_id);
CREATE INDEX IF NOT EXISTS contratos_assessor_nome_idx ON public.contratos(assessor_nome);
CREATE INDEX IF NOT EXISTS contratos_importacao_idx ON public.contratos(importacao_id);

-- RLS
ALTER TABLE public.contratos_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contratos_importacoes_admin" ON public.contratos_importacoes;
DROP POLICY IF EXISTS "contratos_admin" ON public.contratos;
DROP POLICY IF EXISTS "contratos_vendedor" ON public.contratos;

CREATE POLICY "contratos_importacoes_admin" ON public.contratos_importacoes
  FOR ALL TO authenticated USING (get_my_role() = 'admin');

-- Admin vê tudo, vendedor vê apenas seus clientes
CREATE POLICY "contratos_admin" ON public.contratos
  FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "contratos_vendedor" ON public.contratos
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'vendedor' AND
    cliente_id IN (
      SELECT id FROM public.clientes WHERE assessor_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_importacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos TO authenticated;
