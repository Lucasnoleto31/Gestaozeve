-- Tabela de log de notificações enviadas
CREATE TABLE IF NOT EXISTS public.notificacoes_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo        text NOT NULL,
  -- 'risco' | 'followup_atrasado' | 'sem_operar_30' | 'sem_operar_60' | 'sem_operar_90'
  cliente_id  uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  assessor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  enviado_em  timestamptz DEFAULT now() NOT NULL,
  canal       text DEFAULT 'email',
  metadata    jsonb
);

CREATE INDEX IF NOT EXISTS notificacoes_log_cliente_tipo_idx
  ON public.notificacoes_log (cliente_id, tipo, enviado_em DESC);

-- Service role precisa de acesso total
GRANT ALL ON public.notificacoes_log TO service_role;
