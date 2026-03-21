-- =============================================
-- ZeveAI — Clientes v2: Histórico + Follow-ups
-- Execute APÓS supabase-clientes.sql
-- =============================================

-- 1. Novos campos em cliente_dados_chs
ALTER TABLE public.cliente_dados_chs
  ADD COLUMN IF NOT EXISTS lotes_girados_mes NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lotes_zerados_mes NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_operados_mes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receita_acumulada NUMERIC(15,2) DEFAULT 0;

-- 2. Histórico mensal (dados para os gráficos)
CREATE TABLE IF NOT EXISTS public.cliente_historico_mensal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  mes TEXT NOT NULL, -- formato: YYYY-MM
  receita NUMERIC(15,2) DEFAULT 0,
  lotes_girados NUMERIC(15,2) DEFAULT 0,
  lotes_zerados NUMERIC(15,2) DEFAULT 0,
  dias_operados INTEGER DEFAULT 0,
  score NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cliente_id, mes)
);

-- 3. Follow-ups / Próximos contatos
CREATE TABLE IF NOT EXISTS public.cliente_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  agendado_para TIMESTAMPTZ NOT NULL,
  observacao TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'realizado', 'cancelado')),
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.cliente_historico_mensal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_mensal_all" ON public.cliente_historico_mensal;
DROP POLICY IF EXISTS "followups_all" ON public.cliente_followups;

CREATE POLICY "historico_mensal_all" ON public.cliente_historico_mensal
  FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));

CREATE POLICY "followups_all" ON public.cliente_followups
  FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_historico_mensal TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_followups TO authenticated;
