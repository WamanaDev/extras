-- Remove CPF do colaborador: login e identificação passam a usar só a matrícula.
ALTER TABLE colaborador DROP CONSTRAINT IF EXISTS chk_ultimos4;
ALTER TABLE colaborador DROP COLUMN IF EXISTS cpf_hash;
ALTER TABLE colaborador DROP COLUMN IF EXISTS cpf_ultimos4;
