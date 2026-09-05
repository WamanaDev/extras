/**
 * API-COL-006 — `GET /api/minhas-marcacoes?cicloId=`.
 *
 * Leitura simples (`ACID`: "Leitura simples") — uma query trazendo
 * `marcacao` + `plantao` + `rt` do ciclo do ator, e `ciclo` para saber se
 * ainda está `PUBLICADO`/dentro da janela. `podeCancelar` é calculado aqui,
 * no servidor (spec, "I": "a UI não deduz a partir da data") — reaproveita
 * `calcularEstadoJanela` de `./ciclo-atual` (API-COL-001) em vez de
 * reimplementar a mesma conta ANTES/ABERTA/ENCERRADA.
 *
 * `colaboradorId` vem sempre do ator da sessão (`route.ts`) — o `where`
 * abaixo filtra por ele, então marcação de terceiro nunca aparece na lista
 * (spec, teste 3), por construção, não por checagem posterior.
 */
import type { PrismaClient } from '@prisma/client';
import { calcularEstadoJanela } from './ciclo-atual';

export type ClienteMinhasMarcacoes = Pick<PrismaClient, 'marcacao' | 'ciclo'>;

export interface MarcacaoHistorico {
  id: string;
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  horaInicio: string;
  horaFim: string;
  status: 'CONFIRMADA' | 'CANCELADA';
  cruzada: boolean;
  criadoEm: string;
  canceladoEm: string | null;
  podeCancelar: boolean;
}

export interface MinhasMarcacoesResposta {
  marcacoes: MarcacaoHistorico[];
  totais: { confirmadas: number; canceladas: number; horas: number };
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function formatarHora(hora: Date): string {
  return hora.toISOString().slice(11, 19);
}

export async function buscarMinhasMarcacoes(
  prisma: ClienteMinhasMarcacoes,
  colaboradorId: string,
  cicloId: string,
  agora: Date,
): Promise<MinhasMarcacoesResposta> {
  const ciclo = await prisma.ciclo.findUnique({ where: { id: cicloId } });

  const linhas = await prisma.marcacao.findMany({
    where: { colaboradorId, plantao: { cicloId } },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      status: true,
      cruzada: true,
      criadoEm: true,
      canceladoEm: true,
      plantao: {
        select: {
          data: true,
          tipo: true,
          horaInicio: true,
          horaFim: true,
          cargaHoras: true,
          rt: { select: { nome: true } },
        },
      },
    },
  });

  // Ciclo inexistente ou sem nenhuma marcação: nunca é possível cancelar
  // (não há janela conhecida) — mesma regra vale se o ciclo já foi FECHADO.
  const estadoJanela = ciclo ? calcularEstadoJanela(ciclo.aberturaMarcacao, ciclo.fechamentoMarcacao, agora) : 'ENCERRADA';
  const cicloFechado = !ciclo || ciclo.status === 'FECHADO';

  let confirmadas = 0;
  let canceladas = 0;
  let horas = 0;

  const marcacoes: MarcacaoHistorico[] = linhas.map((linha) => {
    if (linha.status === 'CONFIRMADA') {
      confirmadas += 1;
      horas += linha.plantao.cargaHoras;
    } else {
      canceladas += 1;
    }

    return {
      id: linha.id,
      data: formatarData(linha.plantao.data),
      tipo: linha.plantao.tipo,
      rt: linha.plantao.rt.nome,
      horaInicio: formatarHora(linha.plantao.horaInicio),
      horaFim: formatarHora(linha.plantao.horaFim),
      status: linha.status,
      cruzada: linha.cruzada,
      criadoEm: linha.criadoEm.toISOString(),
      canceladoEm: linha.canceladoEm ? linha.canceladoEm.toISOString() : null,
      podeCancelar: linha.status === 'CONFIRMADA' && !cicloFechado && estadoJanela !== 'ENCERRADA',
    };
  });

  return {
    marcacoes,
    totais: { confirmadas, canceladas, horas },
  };
}
