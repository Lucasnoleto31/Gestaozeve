-- Migration v3: add Genial import fields to clientes table
-- Run this in the Supabase SQL editor

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tipo_pessoa      text,          -- 'F' (física) ou 'J' (jurídica)
  ADD COLUMN IF NOT EXISTS data_habilitacao date,          -- data de abertura da conta na Genial
  ADD COLUMN IF NOT EXISTS patrimonio       numeric(15,2), -- patrimônio declarado
  ADD COLUMN IF NOT EXISTS profissao        text,          -- profissão
  ADD COLUMN IF NOT EXISTS perfil_genial    text,          -- 'digital', 'premium', 'sem_informacao'
  ADD COLUMN IF NOT EXISTS situacao_conta   text;          -- 'ATIVA', 'INATIVA', etc.

-- Conta SINACOR is the Genial account number and lives in cliente_contas.
-- Clients can have multiple accounts. Add unique constraint so we can upsert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cliente_contas_numero_conta_unique'
  ) THEN
    ALTER TABLE cliente_contas
      ADD CONSTRAINT cliente_contas_numero_conta_unique UNIQUE (numero_conta);
  END IF;
END;
$$;
