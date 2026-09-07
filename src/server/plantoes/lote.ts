/**
 * API-ADM-PLA-002 — núcleo transacional de `POST /api/admin/plantoes/lote`.
 */
import type { Turno } from '@prisma/client';
import type { ClienteTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { ContextoAuditoria } from './criar';
import { erroPlantao422 } from './erros';
import {
  calcularCargaHoras,
  dataDentroDoCiclo,
  dataParaChave,
  diaDaSemana,
  diasEntre,
  horaParaData,
  horasPadraoDoTurno,
  paridadeDoDia,
} from './util';

export interface GerarLoteInput {
  cicloId: string;
  rtIds: string[];
  de: Date;
  ate: Date;
  tipos: Turno[];
  vagasTotais: number;
  // `| undefined` explícito: campo `.optional()` de `LoteSchema`
  // (`lote/route.ts`) — `exactOptionalPropertyTypes` (`_conflitos.md`, item 13).
  diasSemana?: number[] | undefined;
  /** Filtro por paridade do DIA DO MÊS (pedido do usuário) — `undefined`/`'AMBOS'` não filtra. */
  paridade?: 'PAR' | 'IMPAR' | 'AMBOS' | undefined;
  permiteCruzada: boolean | null;
  preview: boolean;
}

export type MotivoIgnorado = 'JA_EXISTE' | 'FORA_DO_CICLO';

export interface ItemIgnorado {
  data: string;
  tipo: Turno;
  rt: string;
  motivo: MotivoIgnorado;
}

export interface ItemPreview {
  data: string;
  tipo: Turno;
  rt: string;
  vagas: number;
}

export interface ResultadoLote {
  criados: number;
  ignorados: ItemIgnorado[];
  preview?: ItemPreview[];
}

/** `D:` teto de 500 plantões por chamada (`API-ADM-PLA-002-lote.md`, "ACID"). */
export const TETO_LOTE = 500;

interface Combo {
  data: Date;
  rtId: string;
  tipo: Turno;
}

function gerarCombos(input: GerarLoteInput): Combo[] {
  const combos: Combo[] = [];
  for (const data of diasEntre(input.de, input.ate)) {
    if (input.diasSemana && !input.diasSemana.includes(diaDaSemana(data))) continue;
    if (input.paridade && input.paridade !== 'AMBOS' && paridadeDoDia(data) !== input.paridade) continue;
    for (const rtId of input.rtIds) {
      for (const tipo of input.tipos) {
        combos.push({ data, rtId, tipo });
      }
    }
  }
  return combos;
}

function chaveCombo(rtId: string, data: Date, tipo: Turno): string {
  return `${rtId}|${dataParaChave(data)}|${tipo}`;
}

/**
 * Passos do fluxo (`API-ADM-PLA-002-lote.md`):
 * 1. expande a combinação `[de,ate] × tipos × rtIds` (menos `diasSemana` filtrado);
 * 2. `preview = true` → devolve sem gravar;
 * 3. senão, `createMany` + `skipDuplicates` (a chamada inteira já roda dentro
 *    da `emTransacao` do `route.ts` — tudo ou nada, `A` da spec);
 * 4. audita com os parâmetros do lote, não uma linha por plantão criado (`R`).
 */
export async function gerarLotePlantoes(tx: ClienteTransacao, input: GerarLoteInput, ctx: ContextoAuditoria): Promise<ResultadoLote> {
  const ciclo = await tx.ciclo.findUnique({ where: { id: input.cicloId } });
  const combos = gerarCombos(input);

  if (combos.length > TETO_LOTE) {
    throw erroPlantao422(`Este lote geraria ${combos.length} plantões — o teto por chamada é ${TETO_LOTE}.`, 'LOTE_EXCEDE_TETO');
  }

  const ignorados: ItemIgnorado[] = [];
  const candidatos: Combo[] = [];

  const dentroDoCiclo = (data: Date) => (ciclo ? dataDentroDoCiclo(data, ciclo.ano, ciclo.mes) : false);

  const foraDoCiclo = combos.filter((c) => !dentroDoCiclo(c.data));
  const possiveis = combos.filter((c) => dentroDoCiclo(c.data));
  for (const c of foraDoCiclo) {
    ignorados.push({ data: dataParaChave(c.data), tipo: c.tipo, rt: c.rtId, motivo: 'FORA_DO_CICLO' });
  }

  let existentes = new Set<string>();
  if (possiveis.length > 0) {
    const linhas = await tx.plantao.findMany({
      where: {
        cicloId: input.cicloId,
        rtId: { in: input.rtIds },
        tipo: { in: input.tipos },
        data: { gte: input.de, lte: input.ate },
      },
      select: { rtId: true, data: true, tipo: true },
    });
    existentes = new Set(linhas.map((l) => chaveCombo(l.rtId, l.data, l.tipo)));
  }

  for (const c of possiveis) {
    if (existentes.has(chaveCombo(c.rtId, c.data, c.tipo))) {
      ignorados.push({ data: dataParaChave(c.data), tipo: c.tipo, rt: c.rtId, motivo: 'JA_EXISTE' });
    } else {
      candidatos.push(c);
    }
  }

  if (input.preview) {
    return {
      criados: 0,
      ignorados,
      preview: candidatos.map((c) => ({ data: dataParaChave(c.data), tipo: c.tipo, rt: c.rtId, vagas: input.vagasTotais })),
    };
  }

  let criados = 0;
  if (candidatos.length > 0) {
    const linhas = candidatos.map((c) => {
      const padrao = horasPadraoDoTurno(c.tipo);
      return {
        cicloId: input.cicloId,
        rtId: c.rtId,
        data: c.data,
        tipo: c.tipo,
        horaInicio: horaParaData(padrao.horaInicio),
        horaFim: horaParaData(padrao.horaFim),
        cargaHoras: calcularCargaHoras(padrao.horaInicio, padrao.horaFim),
        vagasTotais: input.vagasTotais,
        permiteCruzada: input.permiteCruzada,
      };
    });
    const resultado = await tx.plantao.createMany({ data: linhas, skipDuplicates: true });
    criados = resultado.count;
  }

  // `PLANTAO_CRIADO_LOTE` não existe em `AcaoAuditoria`
  // (`src/server/audit/registrar.ts`) — enum fechado, entregável de
  // `02-seguranca/auditoria.md` (limite rígido, `AGENTS.md`: não pode ser
  // alterado sem revisão humana). Reaproveita `PLANTAO_CRIADO` já existente
  // em vez de inventar um valor fora do enum — ver `_conflitos.md`. O
  // payload deixa claro que é um evento de lote (`lote: true`), não uma
  // criação individual.
  await registrarAuditoria(tx, {
    atorTipo: 'ADMIN',
    atorId: ctx.atorId,
    acao: 'PLANTAO_CRIADO',
    entidade: 'plantao',
    entidadeId: null,
    payload: { lote: true, parametros: input, criados, ignorados },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { criados, ignorados };
}
