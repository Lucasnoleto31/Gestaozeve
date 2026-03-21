-- Barras da corretora — mapeamento nome_barra → assessor + influenciador
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS public.barras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL UNIQUE,        -- exatamente como aparece no Excel
  assessor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  influenciador_id UUID REFERENCES public.influenciadores(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.barras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "barras_all" ON public.barras;
CREATE POLICY "barras_all" ON public.barras
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'vendedor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.barras TO authenticated;
