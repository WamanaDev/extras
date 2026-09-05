/**
 * Consulta + montagem da grade a partir do banco — extraído de
 * `API-ADM-ESC-001` para ser reaproveitado por `API-ADM-ESC-004`
 * ("Fluxo: 1. Reusar API-ADM-ESC-001"), em vez de duplicar as mesmas seis
 * consultas na rota de exportação.
 */
import type { ClienteTransacao } from '@/server/db/tx';
import { montarGrade, type CoberturaDiaGradeEntrada, type GradeSaida, type LinhaEscalaGradeEntrada } from './grade';

export interface FiltroGrade {
  rt?: string;
  turno?: 'DIURNO' | 'NOTURNO';
}

interface LinhaCoberturaCiclo {
  data: Date;
  rt_codigo: string;
  turno: 'DIURNO' | 'NOTURNO';
  total: number;
  minimo: number;
}

/** Ver `route.ts` de `API-ADM-ESC-001` para a discussão de design desta agregação (uma linha de cobertura por dia). */
function agregarCoberturaPorDia(linhas: LinhaCoberturaCiclo[], turnoFiltro: 'DIURNO' | 'NOTURNO' | undefined): CoberturaDiaGradeEntrada[] {
  const porDia = new Map<number, CoberturaDiaGradeEntrada>();
  for (const linha of linhas) {
    if (turnoFiltro && linha.turno !== turnoFiltro) continue;
    const dia = linha.data.getUTCDate();
    const atual = porDia.get(dia);
    if (!atual) {
      porDia.set(dia, { dia, rt: linha.rt_codigo, turno: linha.turno, total: Number(linha.total), minimo: Number(linha.minimo) });
    } else {
      atual.total += Number(linha.total);
      atual.minimo += Number(linha.minimo);
    }
  }
  return [...porDia.values()];
}

export async function buscarGrade(tx: ClienteTransacao, cicloId: string, filtro: FiltroGrade): Promise<GradeSaida | null> {
  const ciclo = await tx.ciclo.findUnique({ where: { id: cicloId } });
  if (!ciclo) return null;

  const dias = new Date(Date.UTC(ciclo.ano, ciclo.mes, 0)).getUTCDate();

  const colaboradores = await tx.colaborador.findMany({
    where: { ativo: true, ...(filtro.rt !== undefined ? { rtId: filtro.rt } : {}), ...(filtro.turno !== undefined ? { turnoPadrao: filtro.turno } : {}) },
    select: { id: true, nome: true, matricula: true, turnoPadrao: true, escalaAncora: true, escalaPeriodo: true, rt: { select: { id: true, nome: true } } },
    orderBy: { nome: 'asc' },
  });
  const colaboradorIds = colaboradores.map((c) => c.id);

  const linhasEscala = colaboradorIds.length
    ? await tx.escalaDia.findMany({
        where: { cicloId: ciclo.id, colaboradorId: { in: colaboradorIds } },
        select: {
          id: true,
          colaboradorId: true,
          data: true,
          observacao: true,
          codigoEscala: { select: { codigo: true, presenca: true, ocupaHorario: true } },
        },
      })
    : [];

  const linhas: LinhaEscalaGradeEntrada[] = linhasEscala.map((l) => ({
    colaboradorId: l.colaboradorId,
    escalaDiaId: l.id,
    dia: l.data.getUTCDate(),
    codigo: l.codigoEscala.codigo,
    presenca: l.codigoEscala.presenca,
    ocupaHorario: l.codigoEscala.ocupaHorario,
    observacao: l.observacao,
  }));

  const marcacoes = colaboradorIds.length
    ? await tx.marcacao.findMany({
        where: { status: 'CONFIRMADA', colaboradorId: { in: colaboradorIds }, plantao: { cicloId: ciclo.id } },
        select: { colaboradorId: true, plantao: { select: { data: true, tipo: true, rt: { select: { nome: true } } } } },
      })
    : [];
  // Turno e RT do PLANTÃO da extra (não do colaborador) — permite agrupar
  // "Extras Diurno"/"Extras Noturno" pelo turno real da extra e atribuir a
  // extra à RT do plantão coberto, inclusive quando é cruzada de turno e/ou
  // de RT (`grade.ts`, `CelulaGrade.extraTurno`/`extraRt`).
  const diasComExtraConfirmada = new Map(
    marcacoes.map((m) => [`${m.colaboradorId}:${m.plantao.data.getUTCDate()}`, { turno: m.plantao.tipo, rt: m.plantao.rt.nome }]),
  );

  const codigosEscala = await tx.codigoEscala.findMany({ orderBy: { codigo: 'asc' } });
  const codigos = codigosEscala.map((c) => ({ codigo: c.codigo, descricao: c.descricao, cor: c.cor, presenca: c.presenca, ocupaHorario: c.ocupaHorario }));

  const linhasCobertura = await tx.$queryRaw<LinhaCoberturaCiclo[]>`SELECT * FROM cobertura_ciclo(${ciclo.id}::uuid)`;
  const cobertura = agregarCoberturaPorDia(linhasCobertura, filtro.turno);

  return montarGrade({
    ciclo: { ano: ciclo.ano, mes: ciclo.mes, dias },
    colaboradores: colaboradores.map((c) => ({
      id: c.id,
      nome: c.nome,
      matricula: c.matricula,
      rt: c.rt.nome,
      turnoPadrao: c.turnoPadrao,
      escalaAncora: c.escalaAncora,
      escalaPeriodo: c.escalaPeriodo,
    })),
    linhas,
    diasComExtraConfirmada,
    codigos,
    cobertura,
  });
}
