-- =============================================
-- ZeveAI — S16b: permissões das tabelas criadas pelo S16
-- Rode se o S16 já foi aplicado antes deste ajuste (o S16 atual já inclui os GRANTs).
-- Sem isto, o PostgREST devolve 403 para o log de importações e a tarifa por produto.
-- =============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_importacoes_log TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessor_pricing_produto TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
