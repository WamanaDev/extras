/**
 * API-COL-007 — `GET /api/meu-saldo?cicloId=`.
 *
 * Leitura pura de `saldo_colaborador` (FN-008,
 * `prisma/migrations/20260101000007_funcoes/migration.sql`) — nenhuma regra
 * de negócio própria (`restantes` já vem `GREATEST(...,0)` da função; CIA —
 * "I": `motivoBloqueio` é texto administrativo, validado na escrita por
 * `API-ADM-PAR-001`, nunca aqui).
 */
import type { PrismaClient } from '@prisma/client';
import { erroNaoEncontrado } from '@/server/http/erros';

export type ClienteSaldo = Pick<PrismaClient, 'ciclo' | '$queryRaw'>;

export interface SaldoResposta {
  limite: number;
  usadas: number;
  restantes: number;
  permiteCruzada: boolean;
  bloqueado: boolean;
  motivoBloqueio: string | null;
}

interface LinhaSaldo {
  limite: number;
  usadas: number;
  restantes: number;
  permite_cruzada: boolean;
  bloqueado: boolean;
  motivo_bloqueio: string | null;
}

export async function buscarMeuSaldo(prisma: ClienteSaldo, colaboradorId: string, cicloId: string): Promise<SaldoResposta> {
  const ciclo = await prisma.ciclo.findUnique({ where: { id: cicloId } });
  if (!ciclo) {
    throw erroNaoEncontrado('Ciclo não encontrado.');
  }

  const linhas = await prisma.$queryRaw<LinhaSaldo[]>`
    SELECT * FROM saldo_colaborador(${cicloId}::uuid, ${colaboradorId}::uuid)
  `;
  const saldo = linhas[0];
  if (!saldo) {
    throw erroNaoEncontrado('Ciclo não encontrado.');
  }

  return {
    limite: saldo.limite,
    usadas: saldo.usadas,
    restantes: saldo.restantes,
    permiteCruzada: saldo.permite_cruzada,
    bloqueado: saldo.bloqueado,
    motivoBloqueio: saldo.motivo_bloqueio,
  };
}
