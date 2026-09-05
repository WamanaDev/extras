/**
 * API-COL-001 — `GET /api/ciclos/atual`.
 *
 * Serviço puro de leitura (sem transação — uma única query, `ACID`: "Leitura
 * simples"). Separado do `route.ts` para ser testável sem Postgres real: a
 * rota injeta o `PrismaClient` de verdade, o teste injeta um objeto fake com
 * só o método `ciclo.findFirst` (mesmo padrão de injeção de
 * `src/server/services/jornada.ts`).
 */
import type { PrismaClient } from '@prisma/client';

export type ClienteCicloAtual = Pick<PrismaClient, 'ciclo'>;

export type EstadoJanela = 'ANTES' | 'ABERTA' | 'ENCERRADA';

export interface CicloAtualResposta {
  id: string;
  ano: number;
  mes: number;
  janela: {
    abertura: string | null;
    fechamento: string | null;
    estado: EstadoJanela;
  };
  permiteCruzada: boolean;
  servidorEm: string;
}

/**
 * `estado` é sempre derivado contra `agora` (injetado pelo `ctx` do
 * `defineHandler`, nunca `new Date()`) — spec: "a decisão real continua em
 * `FN-005`", esta rota só informa a UI. `servidorEm` é o mesmo `agora`
 * serializado — mesmo instante em ambos os campos por construção, então
 * "relógio do cliente adiantado" nunca muda o `estado` (teste #5).
 */
export function calcularEstadoJanela(abertura: Date | null, fechamento: Date | null, agora: Date): EstadoJanela {
  if (abertura !== null && agora < abertura) return 'ANTES';
  if (fechamento !== null && agora > fechamento) return 'ENCERRADA';
  return 'ABERTA';
}

/** Ciclo `PUBLICADO` mais recente (`criadoEm desc`) — `null` se não houver nenhum (teste #4: só rascunho → `null`). */
export async function buscarCicloAtual(prisma: ClienteCicloAtual, agora: Date): Promise<CicloAtualResposta | null> {
  const ciclo = await prisma.ciclo.findFirst({
    where: { status: 'PUBLICADO' },
    orderBy: { criadoEm: 'desc' },
  });
  if (!ciclo) return null;

  return {
    id: ciclo.id,
    ano: ciclo.ano,
    mes: ciclo.mes,
    janela: {
      abertura: ciclo.aberturaMarcacao ? ciclo.aberturaMarcacao.toISOString() : null,
      fechamento: ciclo.fechamentoMarcacao ? ciclo.fechamentoMarcacao.toISOString() : null,
      estado: calcularEstadoJanela(ciclo.aberturaMarcacao, ciclo.fechamentoMarcacao, agora),
    },
    permiteCruzada: ciclo.permiteCruzada,
    servidorEm: agora.toISOString(),
  };
}
