/**
 * API-ADM-CIC-008 — `GET /api/admin/ciclos/:id/cobertura`.
 *
 * Chama `cobertura_ciclo` (FN-009) e agrega. Leitura consistente numa
 * transação — escalados e extras do mesmo instante (spec, "ACID").
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { erroNaoEncontrado } from '@/server/http/erros';

export const CoberturaQuerySchema = z.object({
  apenasDeficit: z
    .enum(['true', 'false'])
    .optional()
    .transform((valor) => valor === 'true'),
});

export type CoberturaQuery = z.infer<typeof CoberturaQuerySchema>;

export interface DiaCobertura {
  data: string;
  rt: string;
  turno: string;
  escalados: number;
  extras: number;
  total: number;
  minimo: number;
  deficit: number;
}

export interface ResultadoCobertura {
  dias: DiaCobertura[];
  resumo: { diasComDeficit: number; deficitTotal: number };
}

interface LinhaCobertura {
  data: Date;
  rt_codigo: string;
  turno: string;
  escalados: number;
  extras: number;
  total: number;
  minimo: number;
  deficit: number;
}

export async function obterCobertura(
  prisma: PrismaClient,
  cicloId: string,
  query: CoberturaQuery,
): Promise<ResultadoCobertura> {
  return emTransacao(prisma, async (tx) => {
    const existe = await tx.ciclo.findUnique({ where: { id: cicloId }, select: { id: true } });
    if (!existe) throw erroNaoEncontrado();

    const linhas = await tx.$queryRaw<LinhaCobertura[]>`SELECT * FROM cobertura_ciclo(${cicloId}::uuid)`;

    const dias: DiaCobertura[] = linhas
      .filter((linha) => !query.apenasDeficit || linha.deficit > 0)
      .map((linha) => ({
        data: linha.data.toISOString().slice(0, 10),
        rt: linha.rt_codigo,
        turno: linha.turno,
        escalados: linha.escalados,
        extras: linha.extras,
        total: linha.total,
        minimo: linha.minimo,
        deficit: linha.deficit,
      }));

    const diasComDeficit = linhas.filter((linha) => linha.deficit > 0).length;
    const deficitTotal = linhas.reduce((acumulado, linha) => acumulado + linha.deficit, 0);

    return { dias, resumo: { diasComDeficit, deficitTotal } };
  });
}
