-- =============================================
-- ZeveAI — S18: fim da limpeza + conserto da autenticação
-- Rode DEPOIS do supabase-s17-limpeza.sql.
--
-- O que sobrou do S17 e o que este arquivo faz:
--   1. handle_new_user (gatilho de usuário novo em auth.users) gravava em
--      user_roles, que não existe mais → criar usuário quebrava. Reescrita
--      só com a tabela profiles e as colunas do nosso sistema.
--   2. Remove as funções e os 9 tipos (enums) do sistema em inglês e a
--      receitas_total_bruto do sistema antigo.
--   3. Fecha uma brecha herdada: a política "Usuário edita próprio perfil"
--      deixava qualquer usuário trocar o próprio role para admin; e
--      "Usuário insere próprio perfil" deixava criar perfil com qualquer role.
--   4. Garante user_id único em profiles (um perfil por conta).
--
-- Mantém: auth.*, public.profiles, get_my_role(), get_my_profile_id(),
-- set_updated_at(), update_updated_at() + gatilho de updated_at.
-- =============================================

-- 1. Gatilho de usuário novo: só profiles
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unico ON public.profiles (user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nome text := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor');
BEGIN
  IF v_role NOT IN ('admin', 'vendedor', 'influenciador') THEN
    v_role := 'vendedor';
  END IF;
  INSERT INTO public.profiles (user_id, name, nome, email, role, ativo)
  VALUES (NEW.id, v_nome, v_nome, NEW.email, v_role, true)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Lixo que sobrou (sem CASCADE: se algo ainda depender, o erro avisa em vez de apagar escondido)
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_vendedor();
DROP FUNCTION IF EXISTS public.receitas_total_bruto();

DROP TYPE IF EXISTS public.alert_type;
DROP TYPE IF EXISTS public.app_role;
DROP TYPE IF EXISTS public.client_type;
DROP TYPE IF EXISTS public.investor_profile;
DROP TYPE IF EXISTS public.lead_status;
DROP TYPE IF EXISTS public.lead_temperature;
DROP TYPE IF EXISTS public.marital_status;
DROP TYPE IF EXISTS public.partner_type;
DROP TYPE IF EXISTS public.sex;

-- 3. Políticas de profiles: ler = qualquer autenticado; editar o próprio = sem mudar o role;
--    criar e gerenciar = admin (ou o gatilho, que roda como dono)
DROP POLICY IF EXISTS "Usuário insere próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Usuário edita próprio perfil" ON public.profiles;
CREATE POLICY "Usuário edita próprio perfil" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND role = public.get_my_role());

NOTIFY pgrst, 'reload schema';

-- Conferência final
SELECT 'tabela' AS tipo, tablename AS nome FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'funcao', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'tipo', t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
UNION ALL
SELECT 'politica profiles', policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY 1, 2;
