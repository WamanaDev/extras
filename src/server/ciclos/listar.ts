/**
 * API-ADM-CIC-001 — `GET /api/admin/ciclos`.
 *
 * Lógica isolada de `defineHandler` para ser testável com um `PrismaClient`
 * fake (`$queryRaw` mockado) sem tocar banco de verdade.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { RespostaPaginada } from '@/server/http/handler';

export const ListarCiclosQuerySchema = z.object({
  status: z.enum(['RASCUNHO', 'PUBLICADO', 'FECHADO']).optional(),
  ano: z.coerce.number().int().optional(),
});

export type ListarCiclosQuery = z.infer<typeof ListarCiclosQuerySchema> & {
  pagina: number;
  tamanho: number;
};

export interface CicloListado {
  id: string;
  ano: number;
  mes: number;
  status: string;
  limitePadrao: number;
  permiteCruzada: boolean;
  janela: { abertura: string | null; fechamento: string | null };
  totais: { plantoes: number; vagas: number; ocupadas: number; colaboradoresComEscala: number };
}

interface LinhaBruta {
  id: string;
  ano: number;
  mes: number;
  status: string;
  limitePadrao: number;
  permiteCruzada: boolean;
  abertura: Date | null;
  fechamento: Date | null;
  plantoes: number;
  vagas: number;
  ocupadas: number;
  colaboradoresComEscala: number;
  totalCount: number;
}

/**
 * Agregados numa query só (`LEFT JOIN LATERAL`) — duas queries poderiam
 * mostrar números de instantes diferentes (spec, seção "ACID"). `count(*)
 * OVER()` traz o total da mesma foto, em vez de uma segunda query `COUNT(*)`
 * que poderia divergir sob escrita concorrente.
 */
export async function listarCiclos(
  prisma: PrismaClient,
  query: ListarCiclosQuery,
): Promise<RespostaPaginada<CicloListado>> {
  const offset = (query.pagina - 1) * query.tamanho;
  const statusFiltro = query.status ?? null;
  const anoFiltro = query.ano ?? null;

  const linhas = await prisma.$queryRaw<LinhaBruta[]>`
    SELECT
      c.id, c.ano, c.mes, c.status::text AS status,
      c.limite_padrao AS "limitePadrao", c.permite_cruzada AS "permiteCruzada",
      c.abertura_marcacao AS abertura, c.fechamento_marcacao AS fechamento,
      COALESCE(p.plantoes, 0)::int AS plantoes,
      COALESCE(p.vagas, 0)::int AS vagas,
      COALESCE(p.ocupadas, 0)::int AS ocupadas,
      COALESCE(e.colaboradores, 0)::int AS "colaboradoresComEscala",
      count(*) OVER()::int AS "totalCount"
    FROM ciclo c
    LEFT JOIN LATERAL (
      SELECT count(*) AS plantoes,
             COALESCE(sum(vagas_totais), 0) AS vagas,
             COALESCE(sum(vagas_ocupadas), 0) AS ocupadas
        FROM plantao WHERE ciclo_id = c.id AND ativo
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT colaborador_id) AS colaboradores
        FROM escala_dia WHERE ciclo_id = c.id
    ) e ON true
    WHERE (${statusFiltro}::status_ciclo IS NULL OR c.status = ${statusFiltro}::status_ciclo)
      AND (${anoFiltro}::int IS NULL OR c.ano = ${anoFiltro}::int)
    ORDER BY c.ano DESC, c.mes DESC
    LIMIT ${query.tamanho} OFFSET ${offset}
  `;

  const itens: CicloListado[] = linhas.map((linha) => ({
    id: linha.id,
    ano: linha.ano,
    mes: linha.mes,
    status: linha.status,
    limitePadrao: linha.limitePadrao,
    permiteCruzada: linha.permiteCruzada,
    janela: {
      abertura: linha.abertura ? linha.abertura.toISOString() : null,
      fechamento: linha.fechamento ? linha.fechamento.toISOString() : null,
    },
    totais: {
      plantoes: linha.plantoes,
      vagas: linha.vagas,
      ocupadas: linha.ocupadas,
      colaboradoresComEscala: linha.colaboradoresComEscala,
    },
  }));

  const total = linhas[0]?.totalCount ?? 0;
  return { itens, total };
}
