-- =============================================
-- ZeveAI — Setup Completo do Supabase
-- Execute no SQL Editor do Supabase
-- =============================================

-- 1. Tabela de perfis
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir colunas caso a tabela já existisse
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'vendedor';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- Adicionar constraint de role se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'vendedor', 'influenciador'));
  END IF;
END$$;

-- 2. Tabela de influenciadores
CREATE TABLE IF NOT EXISTS public.influenciadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Etapas do funil
CREATE TABLE IF NOT EXISTS public.funil_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  cor TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Scripts de venda
CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id UUID REFERENCES public.funil_etapas(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  origem TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir colunas novas caso a tabela já existisse
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS influenciador_id UUID REFERENCES public.influenciadores(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS etapa_id UUID REFERENCES public.funil_etapas(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS origem TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS observacoes TEXT;
-- Converter status de ENUM para TEXT se necessário, depois garantir coluna
DO $$
BEGIN
  -- Se a coluna status for do tipo enum, converter para text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'status'
    AND udt_name != 'text'
  ) THEN
    ALTER TABLE public.leads ALTER COLUMN status TYPE TEXT USING status::TEXT;
  END IF;

  -- Adicionar coluna se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo';
  END IF;

  -- Adicionar constraint se não existir
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_status_check CHECK (status IN ('ativo', 'convertido', 'perdido'));
  END IF;
END$$;

-- 6. Histórico de movimentação de leads
CREATE TABLE IF NOT EXISTS public.lead_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  etapa_anterior_id UUID REFERENCES public.funil_etapas(id) ON DELETE SET NULL,
  etapa_nova_id UUID REFERENCES public.funil_etapas(id) ON DELETE SET NULL NOT NULL,
  vendedor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS (Row Level Security)
-- =============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influenciadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funil_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_historico ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
DROP FUNCTION IF EXISTS public.get_my_role() CASCADE;
CREATE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's profile id
DROP FUNCTION IF EXISTS public.get_my_profile_id() CASCADE;
CREATE FUNCTION public.get_my_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's influenciador id
DROP FUNCTION IF EXISTS public.get_my_influenciador_id() CASCADE;
CREATE FUNCTION public.get_my_influenciador_id()
RETURNS UUID AS $$
  SELECT id FROM public.influenciadores WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles: todos autenticados podem ler, só admin pode gerenciar
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (get_my_role() = 'admin');

-- Influenciadores: todos autenticados leem
DROP POLICY IF EXISTS "influenciadores_select" ON public.influenciadores;
DROP POLICY IF EXISTS "influenciadores_insert" ON public.influenciadores;
CREATE POLICY "influenciadores_select" ON public.influenciadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "influenciadores_insert" ON public.influenciadores FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');

-- Funil etapas: todos leem, admin gerencia
DROP POLICY IF EXISTS "etapas_select" ON public.funil_etapas;
DROP POLICY IF EXISTS "etapas_insert" ON public.funil_etapas;
DROP POLICY IF EXISTS "etapas_update" ON public.funil_etapas;
DROP POLICY IF EXISTS "etapas_delete" ON public.funil_etapas;
CREATE POLICY "etapas_select" ON public.funil_etapas FOR SELECT TO authenticated USING (true);
CREATE POLICY "etapas_insert" ON public.funil_etapas FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "etapas_update" ON public.funil_etapas FOR UPDATE TO authenticated USING (get_my_role() = 'admin');
CREATE POLICY "etapas_delete" ON public.funil_etapas FOR DELETE TO authenticated USING (get_my_role() = 'admin');

-- Scripts: todos autenticados leem, admin gerencia
DROP POLICY IF EXISTS "scripts_select" ON public.scripts;
DROP POLICY IF EXISTS "scripts_insert" ON public.scripts;
DROP POLICY IF EXISTS "scripts_delete" ON public.scripts;
CREATE POLICY "scripts_select" ON public.scripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "scripts_insert" ON public.scripts FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "scripts_delete" ON public.scripts FOR DELETE TO authenticated USING (get_my_role() = 'admin');

-- Leads: admin e vendedor veem todos; influenciador só seus leads
DROP POLICY IF EXISTS "leads_select_admin_vendedor" ON public.leads;
DROP POLICY IF EXISTS "leads_select_influenciador" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_auth" ON public.leads;
DROP POLICY IF EXISTS "leads_update" ON public.leads;
CREATE POLICY "leads_select_admin_vendedor" ON public.leads
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'vendedor'));

CREATE POLICY "leads_select_influenciador" ON public.leads
  FOR SELECT TO authenticated
  USING (get_my_role() = 'influenciador' AND influenciador_id = get_my_influenciador_id());

-- Leads: anon pode inserir (para captação via link público)
CREATE POLICY "leads_insert_anon" ON public.leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "leads_insert_auth" ON public.leads FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'vendedor'));

CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'vendedor'));

-- Lead histórico: admin e vendedor
DROP POLICY IF EXISTS "historico_select" ON public.lead_historico;
DROP POLICY IF EXISTS "historico_insert" ON public.lead_historico;
CREATE POLICY "historico_select" ON public.lead_historico FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'vendedor'));
CREATE POLICY "historico_insert" ON public.lead_historico FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'vendedor'));

-- =============================================
-- Trigger: criar profile automaticamente
-- (Opcional — você pode criar via API admin)
-- =============================================

-- =============================================
-- Dados iniciais: Etapas do Funil
-- =============================================

INSERT INTO public.funil_etapas (nome, ordem, cor) VALUES
  ('Prospecção', 1, '#6366f1'),
  ('Primeiro Contato', 2, '#8b5cf6'),
  ('Apresentação', 3, '#f59e0b'),
  ('Proposta', 4, '#3b82f6'),
  ('Follow-up', 5, '#ec4899'),
  ('Fechamento', 6, '#10b981')
ON CONFLICT DO NOTHING;

-- =============================================
-- Scripts de exemplo
-- =============================================

INSERT INTO public.scripts (etapa_id, titulo, conteudo, ordem)
SELECT
  e.id,
  'Abertura — Primeiro Contato',
  'Olá [NOME], tudo bem?

Meu nome é [SEU NOME] e sou assessor de investimentos especializado em traders.

Vi que você tem interesse em potencializar seus resultados no mercado. Posso te mostrar como nossa assessoria tem ajudado traders a melhorar a consistência e gestão de risco.

Você tem 15 minutos para uma conversa rápida?',
  1
FROM public.funil_etapas e WHERE e.nome = 'Primeiro Contato';

INSERT INTO public.scripts (etapa_id, titulo, conteudo, ordem)
SELECT
  e.id,
  'Qualificação',
  'Perguntas para qualificar o lead:

1. Há quanto tempo você opera no mercado?
2. Quais instrumentos você negocia? (ações, futuros, forex)
3. Qual é o seu maior desafio atual?
4. Você já teve assessoria de investimentos antes?
5. Qual é o seu capital alocado para trading?

Objetivo: entender o perfil e dor do lead para apresentar a solução correta.',
  2
FROM public.funil_etapas e WHERE e.nome = 'Primeiro Contato';

INSERT INTO public.scripts (etapa_id, titulo, conteudo, ordem)
SELECT
  e.id,
  'Apresentação da Assessoria',
  'Nossa assessoria oferece:

✅ Acompanhamento personalizado do seu portfólio
✅ Estratégias de gestão de risco
✅ Acesso a análises exclusivas do mercado
✅ Suporte direto com especialistas
✅ Relatórios mensais de performance

Traders que trabalham conosco têm em média X% a mais de consistência nos resultados.

O que acha de marcarmos uma apresentação completa?',
  1
FROM public.funil_etapas e WHERE e.nome = 'Apresentação';

INSERT INTO public.scripts (etapa_id, titulo, conteudo, ordem)
SELECT
  e.id,
  'Follow-up após silêncio',
  'Olá [NOME]!

Só passando para verificar se você teve a oportunidade de pensar sobre nossa conversa.

Sei que a rotina é corrida, mas quero garantir que você tenha todas as informações antes de decidir.

Posso te enviar um material sobre como nossa assessoria funciona na prática?

Fico no aguardo!',
  1
FROM public.funil_etapas e WHERE e.nome = 'Follow-up';

INSERT INTO public.scripts (etapa_id, titulo, conteudo, ordem)
SELECT
  e.id,
  'Fechamento',
  'Baseado em tudo que conversamos, acredito que nossa assessoria é o que você precisa para o próximo nível.

Temos duas opções:
- Plano Essencial: [VALOR] — ideal para traders iniciantes a intermediários
- Plano Premium: [VALOR] — para traders que querem suporte completo

Qual das opções faz mais sentido para o seu momento atual?

[Aguarde resposta — não pressione]

Se precisar de mais informações, estou aqui. Quando podemos formalizar?',
  1
FROM public.funil_etapas e WHERE e.nome = 'Fechamento';
