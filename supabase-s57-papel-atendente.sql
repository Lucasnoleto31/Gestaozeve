-- ============================================================================
-- S57 · Papel "atendente" (acesso restrito à tela de Leads)
-- Re-runnável. Roda em segundos.
--
-- Lucas, 09/11/2026: "cadastramos a Karen; não queremos que ela veja as comissões nem os dados da
-- Milena (quem ela atende, quem ela ganhou); a Karen vê só os leads dela".
-- O app (commit a9dc9bd) já entende o papel 'atendente': só a tela de Leads, com os leads em que a
-- pessoa é a responsável. Falta o banco aceitar o valor: profiles.role tem um CHECK com a lista de
-- papéis, e a função que cria o perfil no cadastro troca papel desconhecido por 'vendedor'.
--   1. CHECK de profiles.role passa a aceitar 'atendente'
--   2. handle_new_user aceita 'atendente'
--   3. A Karen passa de 'vendedor' para 'atendente'
-- ============================================================================

-- 1. CHECK do papel: remove o que existir sobre role, seja qual for o nome, e recria com a lista nova
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'vendedor', 'atendente', 'influenciador'));

-- 2. Perfil criado no cadastro do usuário: aceita o papel novo (antes virava 'vendedor')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nome text := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor');
BEGIN
  IF v_role NOT IN ('admin', 'vendedor', 'atendente', 'influenciador') THEN
    v_role := 'vendedor';
  END IF;
  INSERT INTO public.profiles (user_id, name, nome, email, role, ativo)
  VALUES (NEW.id, v_nome, v_nome, NEW.email, v_role, true)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Karen: só os leads dela
UPDATE public.profiles
SET role = 'atendente', updated_at = now()
WHERE nome ILIKE 'Karen%' AND role = 'vendedor';

-- Conferência: a Karen deve aparecer como atendente; os demais ficam como estavam
SELECT nome, role, corretoras, ativo FROM public.profiles ORDER BY nome;
