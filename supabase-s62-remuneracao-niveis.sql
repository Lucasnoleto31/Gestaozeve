-- ============================================================================
-- S62 · Remuneração da equipe por níveis
-- Re-runnável. Roda em segundos. Só cria tabelas e colunas novas e grava a tabela do Lucas: nada do que já
-- existe muda (as regras de comissão por conta continuam valendo para os meses antes do modelo e para quem
-- não está nele).
--
-- Lucas, 18/11/2026, sobre a tabela de 4 níveis: "vamos deixar assim"; e, sobre o começo: "pode fazer valer
-- já para novembro mesmo". O que a equipe recebe passa a seguir o nível de cada um: fixo, abertura,
-- ativação, reativação (metade quando o cliente volta a girar, metade se ainda gira 3 meses depois) e bônus
-- sobre o líquido da base ativa (cheio nos 12 meses depois do último movimento da pessoa com o cliente,
-- metade depois). O nível sai da média dos pontos dos 3 meses anteriores e é revisto a cada 3 meses: sobe na
-- revisão em que a média passa do limite e só desce depois de duas revisões seguidas abaixo.
-- A conta fica no aplicativo (src/lib/gestao/remuneracao.ts); aqui ficam as tabelas que ele lê e que a tela
-- Comissões › Pagamentos e regras edita.
--   1. remuneracao_niveis: os níveis (pontos a partir de, fixo, valor de cada evento, bônus), com vigência
--   2. remuneracao_regua: pontos de cada evento e o que fica para o escritório de cada R$ 1 da Genial, com vigência
--   3. responsaveis.nivel_desde (mês em que a pessoa entra no modelo) e responsaveis.trabalha_desde (primeiro
--      mês trabalhado: os meses antes dele não entram na média de pontos)
--   4. A tabela do Lucas desde 01/11/2026 e Aikon, Milena e Karen no modelo desde 01/11/2026
--   5. remuneracao_giro: lotes e receita dos clientes da base, mês a mês (lotes_mes só é lida por função)
-- ============================================================================

-- 1. Níveis ------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.remuneracao_niveis (
  vigencia date NOT NULL,                      -- vale a partir deste mês (dia 1)
  nivel smallint NOT NULL CHECK (nivel BETWEEN 1 AND 9),
  pontos_min numeric NOT NULL CHECK (pontos_min >= 0),          -- média de pontos por mês a partir da qual vale
  fixo numeric(12,2) NOT NULL CHECK (fixo >= 0),
  abertura numeric(12,2) NOT NULL CHECK (abertura >= 0),         -- por conta aberta
  ativacao numeric(12,2) NOT NULL CHECK (ativacao >= 0),         -- por cliente novo que gira
  reativacao_volta numeric(12,2) NOT NULL CHECK (reativacao_volta >= 0),     -- quando o cliente parado volta a girar
  reativacao_3meses numeric(12,2) NOT NULL CHECK (reativacao_3meses >= 0),   -- se ainda gira 3 meses depois
  bonus_1ano numeric(7,4) NOT NULL CHECK (bonus_1ano >= 0 AND bonus_1ano <= 1),       -- fração do líquido da base (0,05 = 5 %)
  bonus_depois numeric(7,4) NOT NULL CHECK (bonus_depois >= 0 AND bonus_depois <= 1), -- depois do 1º ano
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vigencia, nivel)
);

-- 2. Régua de pontos e parâmetros da conta ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.remuneracao_regua (
  vigencia date PRIMARY KEY,
  pontos_abertura numeric NOT NULL DEFAULT 0,          -- abertura já é paga na hora: não conta ponto
  pontos_ativacao_genial numeric NOT NULL DEFAULT 1,   -- cliente novo girando
  pontos_ativacao_btg numeric NOT NULL DEFAULT 1,
  pontos_ativacao_xp numeric NOT NULL DEFAULT 1,
  pontos_reativacao numeric NOT NULL DEFAULT 1,        -- cliente parado que volta a girar
  reais_por_ponto numeric NOT NULL DEFAULT 1000 CHECK (reais_por_ponto > 0),   -- líquido da base ativa que vale 1 ponto
  meses_bonus_cheio integer NOT NULL DEFAULT 12 CHECK (meses_bonus_cheio >= 0),
  meses_revisao integer NOT NULL DEFAULT 3 CHECK (meses_revisao >= 1),
  meses_permanencia integer NOT NULL DEFAULT 3 CHECK (meses_permanencia >= 1),
  -- o que fica para o escritório de cada R$ 1 de corretagem e zeragem da Genial (DRE de mai a out/26): a Genial
  -- fica com 30,1 %, PIS/COFINS 6,65 % e IR 1,5 % (R$ 0,6427); a plataforma custa R$ 13.900 por 661 mil lotes
  genial_retencao_pct numeric NOT NULL DEFAULT 30.1,
  genial_pis_cofins_pct numeric NOT NULL DEFAULT 6.65,
  genial_ir_pct numeric NOT NULL DEFAULT 1.5,
  genial_plataforma_lote numeric NOT NULL DEFAULT 0.021,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Quem está no modelo ---------------------------------------------------------------------------------
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS nivel_desde date;
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS trabalha_desde date;

-- 4. A tabela do Lucas (18/11/2026), desde novembro --------------------------------------------------------
INSERT INTO public.remuneracao_niveis (vigencia, nivel, pontos_min, fixo, abertura, ativacao, reativacao_volta, reativacao_3meses, bonus_1ano, bonus_depois) VALUES
  (DATE '2026-11-01', 1,  0, 1000, 10,  20, 10,   10,   0.025, 0.0125),
  (DATE '2026-11-01', 2, 10, 1500, 15,  25, 12.5, 12.5, 0.05,  0.025),
  (DATE '2026-11-01', 3, 30, 2000, 25,  80, 40,   40,   0.10,  0.05),
  (DATE '2026-11-01', 4, 60, 3000, 50, 150, 75,   75,   0.20,  0.10)
ON CONFLICT (vigencia, nivel) DO NOTHING;

INSERT INTO public.remuneracao_regua (vigencia) VALUES (DATE '2026-11-01') ON CONFLICT (vigencia) DO NOTHING;

-- Aikon trabalha desde jan/26 (regra do BTG), Milena e Karen desde out/26 (primeiras regras delas)
UPDATE public.responsaveis SET nivel_desde = DATE '2026-11-01' WHERE nome IN ('Aikon', 'Milena', 'Karen') AND nivel_desde IS NULL;
UPDATE public.responsaveis SET trabalha_desde = DATE '2026-01-01' WHERE nome = 'Aikon' AND trabalha_desde IS NULL;
UPDATE public.responsaveis SET trabalha_desde = DATE '2026-10-01' WHERE nome IN ('Milena', 'Karen') AND trabalha_desde IS NULL;

-- 5. Giro dos clientes da base: lotes e receita por cliente, corretora e mês (lotes_mes só é lida por função;
--    a mesma soma da lista de clientes)
CREATE OR REPLACE FUNCTION public.remuneracao_giro(p_clientes uuid[], p_mes_ini date, p_mes_fim date)
RETURNS TABLE(cliente_id uuid, corretora text, mes_ref date, lotes numeric, receita numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT lm.cliente_id, lm.corretora, lm.mes_ref, SUM(lm.operados), SUM(lm.receita)
  FROM public.lotes_mes lm
  WHERE lm.cliente_id = ANY (p_clientes) AND lm.mes_ref BETWEEN p_mes_ini AND p_mes_fim AND public.acesso_ok()
  GROUP BY 1, 2, 3;
$$;

-- 6. Permissões: o aplicativo lê e grava pelo servidor (service role) -----------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['remuneracao_niveis', 'remuneracao_regua']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.remuneracao_giro(uuid[], date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remuneracao_giro(uuid[], date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.remuneracao_giro(uuid[], date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência: a tabela, a régua e quem está no modelo
SELECT vigencia, nivel, pontos_min, fixo, abertura, ativacao, reativacao_volta, reativacao_3meses, bonus_1ano, bonus_depois
FROM public.remuneracao_niveis ORDER BY vigencia, nivel;
SELECT * FROM public.remuneracao_regua ORDER BY vigencia;
SELECT nome, comissionado, nivel_desde, trabalha_desde FROM public.responsaveis WHERE comissionado OR nivel_desde IS NOT NULL ORDER BY nome;
