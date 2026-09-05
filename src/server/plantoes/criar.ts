/**
 * API-ADM-PLA-001 — núcleo transacional de `POST /api/admin/plantoes`.
 * Extraído do `route.ts` só para ser testável sem HTTP/Prisma real: os
 * testes de aceitação injetam um `tx` fake (mock de `ClienteTransacao`).
 */
import type { Turno } from '@prisma/client';
import type { ClienteTransacao } from '@/server/db/tx';
import { ehViolacaoDeUnicidade } from '@/server/db/tx';
import { erroNaoEncontrado } from '@/server/http/erros';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroPlantao409, erroPlantao422 } from './erros';
import { calcularCargaHoras, dataDentroDoCiclo, horaParaData, horasPadraoDoTurno } from './util';

export interface CriarPlantaoInput {
  cicloId: string;
  rtId: string;
  data: Date;
  tipo: Turno;
  // `| undefined` explícito: o corpo vem de `CriarPlantaoSchema.parse()`
  // (`route.ts`), cujos campos `.optional()` são inferidos como
  // `T | undefined`, não só "chave ausente" — sob `exactOptionalPropertyTypes`
  // o TS exige que o tipo alvo declare o mesmo (`_conflitos.md`, item 13).
  horaInicio?: string | undefined;
  horaFim?: string | undefined;
  vagasTotais: number;
  permiteCruzada: boolean | null;
  observacao?: string | null | undefined;
}

export interface ContextoAuditoria {
  atorId: string;
  ip: string;
  userAgent: string;
  requestId: string;
}

function ehConflitoDeUnicidade(erro: unknown): boolean {
  if (ehViolacaoDeUnicidade(erro)) return true;
  return typeof erro === 'object' && erro !== null && (erro as { code?: string }).code === 'P2002';
}

/**
 * Passos do fluxo (`API-ADM-PLA-001-criar.md`):
 * 1. valida data dentro do mês do ciclo (`DATA_FORA_DO_CICLO`);
 * 2. insere — a trigger `preencher_intervalo` calcula `inicio_em`/`fim_em`,
 *    esta função nunca os escreve (só `carga_horas`, que a trigger não
 *    calcula — ver `./util.ts`);
 * 3. audita `PLANTAO_CRIADO`;
 * 4. broadcast — sem infraestrutura de Realtime entregue no repositório
 *    ainda (nenhum `src/server/realtime/*` existe ao rodar esta spec); não
 *    é um entregável desta spec, então não é inventado aqui.
 */
export async function criarPlantao(tx: ClienteTransacao, input: CriarPlantaoInput, ctx: ContextoAuditoria) {
  const ciclo = await tx.ciclo.findUnique({ where: { id: input.cicloId } });
  if (!ciclo) throw erroNaoEncontrado('Ciclo não encontrado.');

  if (ciclo.status === 'FECHADO') {
    throw erroPlantao409('Este ciclo está fechado e não aceita novos plantões.', 'CICLO_FECHADO');
  }

  if (!dataDentroDoCiclo(input.data, ciclo.ano, ciclo.mes)) {
    throw erroPlantao422('A data informada está fora do mês deste ciclo.', 'DATA_FORA_DO_CICLO');
  }

  const padrao = horasPadraoDoTurno(input.tipo);
  const horaInicio = input.horaInicio ?? padrao.horaInicio;
  const horaFim = input.horaFim ?? padrao.horaFim;
  const cargaHoras = calcularCargaHoras(horaInicio, horaFim);

  let plantao;
  try {
    plantao = await tx.plantao.create({
      data: {
        cicloId: input.cicloId,
        rtId: input.rtId,
        data: input.data,
        tipo: input.tipo,
        horaInicio: horaParaData(horaInicio),
        horaFim: horaParaData(horaFim),
        cargaHoras,
        vagasTotais: input.vagasTotais,
        permiteCruzada: input.permiteCruzada,
        observacao: input.observacao ?? null,
      },
    });
  } catch (erro) {
    if (ehConflitoDeUnicidade(erro)) {
      throw erroPlantao409('Já existe um plantão para este RT, data e turno.', 'PLANTAO_JA_EXISTE');
    }
    throw erro;
  }

  await registrarAuditoria(tx, {
    atorTipo: 'ADMIN',
    atorId: ctx.atorId,
    acao: 'PLANTAO_CRIADO',
    entidade: 'plantao',
    entidadeId: plantao.id,
    payload: { depois: plantao },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return plantao;
}
