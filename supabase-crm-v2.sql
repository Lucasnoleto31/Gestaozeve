-- =============================================
-- ZeveAI — CRM v2: Temperatura + Notas + Motivo Perda
-- Execute APÓS supabase-setup.sql
-- =============================================

-- Novos campos em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS temperatura TEXT CHECK (temperatura IN ('quente', 'morno', 'frio')),
  ADD COLUMN IF NOT EXISTS motivo_perda TEXT;

-- Notas de interação por lead (separado do histórico de movimentação)
CREATE TABLE IF NOT EXISTS public.lead_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  autor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  conteudo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lead_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_notas_all" ON public.lead_notas;
CREATE POLICY "lead_notas_all" ON public.lead_notas
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'vendedor'));

CREATE POLICY "lead_notas_insert_anon" ON public.lead_notas
  FOR INSERT TO anon WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notas TO authenticated;
