-- ============================================================================
-- S38 · Mix de plataforma: tudo que é NELOGICA (NELOGICA, NELOGICA_DT, NELOGICA_HB…) num só
-- Re-runnável. Rodar depois da S37.
--
-- O relatório traz a Nelógica com sufixos por produto; no mix de plataforma (Painel e Gráficos)
-- isso espalhava a mesma plataforma em três linhas. O lançamento continua guardado como veio
-- (extrato e operações do dia mostram o nome completo); só o agrupamento muda.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mix_plataforma(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(plataforma text, lotes numeric, zerados numeric, clientes integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE WHEN upper(trim(COALESCE(v.plataforma, ''))) LIKE 'NELOGICA%' THEN 'NELOGICA'
              ELSE COALESCE(NULLIF(trim(v.plataforma), ''), 'Não informada') END,
         SUM(v.lotes_operados), SUM(v.lotes_zerados),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.lotes_operados > 0)::integer
  FROM public.v_lotes v
  WHERE v.corretora = p_corretora AND v.data BETWEEN p_inicio AND p_fim AND public.acesso_ok()
  GROUP BY 1 ORDER BY 2 DESC;
$$;

NOTIFY pgrst, 'reload schema';

-- Conferência: mix do mês de referência da Genial
SELECT * FROM public.mix_plataforma('GENIAL', date_trunc('month', public.brasil_hoje())::date, public.brasil_hoje());
