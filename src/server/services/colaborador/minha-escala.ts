/**
 * API-COL-002 — `GET /api/minha-escala?cicloId=`.
 *
 * `ACID`: "uma query com join, não duas chamadas que possam ver estados
 * diferentes" — por isso uma única `$queryRaw` traz `escala_dia` +
 * `codigo_escala` + a extra confirmada do dia (se houver) numa passada só,
 * em vez de duas queries Prisma separadas que poderiam ver commits
 * diferentes entre si.
 *
 * `turno` por dia: `escala_dia` não tem coluna própria (mesma divergência já
 * registrada em `_conflitos.md`, itens 4/5/7 — a tabela real só guarda
 * âncora/período/turno-base no colaborador e desvios em `troca_escala`).
 * Resolvido com a mesma resolução LATERAL que `FN-002`/`FN-009`
 * (`prisma/migrations/20260101000007_funcoes/migration.sql`) já usam:
 * `COALESCE(troca_escala vigente na data, colaborador.turno_padrao)`.
 *
 * `observacao` de `escala_dia` **nunca** é selecionada (CIA — C: "pode
 * conter dado de saúde", `SEC-STRIDE` I4) — a query abaixo nem lista a
 * coluna, então não há como vazar por engano.
 */
import type { PrismaClient } from '@prisma/client';

export type ClienteMinhaEscala = Pick<PrismaClient, 'ciclo' | '$queryRaw'>;

export interface DiaEscala {
  data: string;
  turno: 'DIURNO' | 'NOTURNO';
  codigo: string;
  descricaoCodigo: string;
  presenca: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  extra?: {
    plantaoId: string;
    rt: string;
    tipo: 'DIURNO' | 'NOTURNO';
    horaInicio: string;
    horaFim: string;
  };
}

export interface MinhaEscalaResposta {
  ciclo: { ano: number; mes: number };
  dias: DiaEscala[];
  totais: { escalados: number; extras: number; horas: number };
}

interface LinhaBruta {
  data: Date;
  turno: 'DIURNO' | 'NOTURNO';
  codigo: string;
  descricao_codigo: string;
  presenca: boolean;
  hora_inicio: string | null;
  hora_fim: string | null;
  inicio_em: Date;
  fim_em: Date;
  extra_plantao_id: string | null;
  extra_rt_nome: string | null;
  extra_tipo: 'DIURNO' | 'NOTURNO' | null;
  extra_hora_inicio: string | null;
  extra_hora_fim: string | null;
  extra_inicio_em: Date | null;
  extra_fim_em: Date | null;
}

function paraData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function horasEntre(inicio: Date, fim: Date): number {
  return (fim.getTime() - inicio.getTime()) / (60 * 60 * 1000);
}

export async function buscarMinhaEscala(
  prisma: ClienteMinhaEscala,
  colaboradorId: string,
  cicloId: string,
): Promise<MinhaEscalaResposta> {
  const ciclo = await prisma.ciclo.findUnique({ where: { id: cicloId } });
  if (!ciclo) {
    // Ciclo inexistente para o ator: mesma resposta de "sem escala gerada" —
    // teste #6 exige lista vazia, sem erro, para ciclo sem escala; um
    // `cicloId` que não existe também não deve virar 500.
    return { ciclo: { ano: 0, mes: 0 }, dias: [], totais: { escalados: 0, extras: 0, horas: 0 } };
  }

  const linhas = await prisma.$queryRaw<LinhaBruta[]>`
    SELECT
      e.data,
      COALESCE(t.turno, col.turno_padrao) AS turno,
      ce.codigo,
      ce.descricao AS descricao_codigo,
      ce.presenca,
      to_char(e.hora_inicio, 'HH24:MI') AS hora_inicio,
      to_char(e.hora_fim, 'HH24:MI') AS hora_fim,
      e.inicio_em, e.fim_em,
      mk.plantao_id AS extra_plantao_id,
      mk.rt_nome AS extra_rt_nome,
      mk.tipo AS extra_tipo,
      mk.hora_inicio_txt AS extra_hora_inicio,
      mk.hora_fim_txt AS extra_hora_fim,
      mk.inicio_em AS extra_inicio_em,
      mk.fim_em AS extra_fim_em
    FROM escala_dia e
    JOIN colaborador col ON col.id = e.colaborador_id
    JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
    LEFT JOIN LATERAL (
      SELECT te.turno FROM troca_escala te
       WHERE te.colaborador_id = col.id AND te.vigencia_inicio <= e.data
       ORDER BY te.vigencia_inicio DESC LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT m.id, p.id AS plantao_id, r.nome AS rt_nome, p.tipo,
             to_char(p.hora_inicio, 'HH24:MI') AS hora_inicio_txt,
             to_char(p.hora_fim, 'HH24:MI') AS hora_fim_txt,
             p.inicio_em, p.fim_em
        FROM marcacao m
        JOIN plantao p ON p.id = m.plantao_id
        JOIN rt r ON r.id = p.rt_id
       WHERE m.colaborador_id = e.colaborador_id AND m.status = 'CONFIRMADA'
         AND p.ciclo_id = e.ciclo_id AND p.data = e.data
       LIMIT 1
    ) mk ON true
    WHERE e.colaborador_id = ${colaboradorId}::uuid AND e.ciclo_id = ${cicloId}::uuid
    ORDER BY e.data
  `;

  const dias: DiaEscala[] = linhas.map((linha) => {
    const dia: DiaEscala = {
      data: paraData(linha.data),
      turno: linha.turno,
      codigo: linha.codigo,
      descricaoCodigo: linha.descricao_codigo,
      presenca: linha.presenca,
      horaInicio: linha.hora_inicio,
      horaFim: linha.hora_fim,
    };
    if (linha.extra_plantao_id) {
      dia.extra = {
        plantaoId: linha.extra_plantao_id,
        rt: linha.extra_rt_nome as string,
        tipo: linha.extra_tipo as 'DIURNO' | 'NOTURNO',
        horaInicio: linha.extra_hora_inicio as string,
        horaFim: linha.extra_hora_fim as string,
      };
    }
    return dia;
  });

  const escalados = linhas.filter((l) => l.presenca).length;
  const extras = linhas.filter((l) => l.extra_plantao_id !== null).length;
  const horasEscaladas = linhas
    .filter((l) => l.presenca)
    .reduce((soma, l) => soma + horasEntre(l.inicio_em, l.fim_em), 0);
  const horasExtras = linhas
    .filter((l) => l.extra_plantao_id !== null)
    .reduce((soma, l) => soma + horasEntre(l.extra_inicio_em as Date, l.extra_fim_em as Date), 0);

  return {
    ciclo: { ano: ciclo.ano, mes: ciclo.mes },
    dias,
    totais: { escalados, extras, horas: horasEscaladas + horasExtras },
  };
}
