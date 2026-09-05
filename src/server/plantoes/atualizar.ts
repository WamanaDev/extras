/**
 * API-ADM-PLA-003 — núcleo transacional de `PATCH /api/admin/plantoes/:id`.
 *
 * Ordem de locks (spec, seção ACID): `FOR UPDATE` no plantão primeiro,
 * depois advisory lock de cada colaborador com marcação confirmada — o
 * único ponto do sistema que inverte a ordem de `FN-005`/`FN-006`
 * (colaborador primeiro). Por isso os locks de colaborador usam
 * `travarColaboradoresComBackoff` (`./locks.ts`, `pg_try_advisory_xact_lock`
 * em laço com prazo de 3s), não o `travarColaborador` bloqueante de
 * `src/server/db/tx.ts`.
 *
 * Propagação de horário: quando `horaInicio`/`horaFim` mudam, a trigger
 * `preencher_intervalo` (`03-banco/triggers.md`) recalcula `inicio_em`/
 * `fim_em` do **plantão** sozinha — mas não toca `marcacao`. Copiar o novo
 * intervalo para as marcações confirmadas e revalidar a jornada de cada
 * colaborador afetado é, por design explícito da spec de triggers,
 * responsabilidade **desta função**, dentro da mesma transação.
 */
import type { ClienteTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { CarregarBlocosOcupados } from '@/server/services/jornada';
import { validaJornada } from '@/server/services/jornada';
import type { Bloco } from '@/lib/escala/blocos';
import type { ContextoAuditoria } from './criar';
import { erroPlantao409 } from './erros';
import { erroNaoEncontrado } from '@/server/http/erros';
import { travarColaboradoresComBackoff } from './locks';
import { dataParaHora, horaParaData } from './util';

// `| undefined` explícito em cada campo opcional: o corpo vem de
// `AtualizarPlantaoSchema.parse()` (`[id]/route.ts`), cujos campos
// `.optional()` são inferidos como `T | undefined` — sob
// `exactOptionalPropertyTypes` o tipo alvo precisa declarar o mesmo
// (`_conflitos.md`, item 13).
export interface AtualizarPlantaoInput {
  vagasTotais?: number | undefined;
  horaInicio?: string | undefined;
  horaFim?: string | undefined;
  permiteCruzada?: boolean | null | undefined;
  observacao?: string | undefined;
  confirmarImpacto?: boolean | undefined;
}

interface ViolacaoJornada {
  colaboradorId: string;
  resultado: 'CONFLITO_DE_HORARIO' | 'EXCEDE_JORNADA';
}

/** Adapter de `CarregarBlocosOcupados` (DOM-002) sobre o `tx` da transação — exclui a própria marcação sendo revalidada e usa o intervalo (`de`/`ate`) via a janela calculada por `validaJornada`. */
function criarCarregador(tx: ClienteTransacao, marcacaoIdExcluir: string): CarregarBlocosOcupados {
  return async (colaboradorId, janela): Promise<Bloco[]> => {
    const [escalas, marcacoes] = await Promise.all([
      tx.escalaDia.findMany({
        where: { colaboradorId, inicioEm: { lt: janela.ate }, fimEm: { gt: janela.de } },
        select: { inicioEm: true, fimEm: true },
      }),
      tx.marcacao.findMany({
        where: {
          colaboradorId,
          status: 'CONFIRMADA',
          id: { not: marcacaoIdExcluir },
          inicioEm: { lt: janela.ate },
          fimEm: { gt: janela.de },
        },
        select: { inicioEm: true, fimEm: true },
      }),
    ]);
    return [...escalas, ...marcacoes].map((b) => ({ inicio: b.inicioEm, fim: b.fimEm }));
  };
}

export async function atualizarPlantao(
  tx: ClienteTransacao,
  plantaoId: string,
  input: AtualizarPlantaoInput,
  ctx: ContextoAuditoria,
) {
  // 1. `SELECT ... FOR UPDATE` no plantão — trava a linha antes de qualquer decisão.
  await tx.$executeRaw`SELECT id FROM plantao WHERE id = ${plantaoId}::uuid FOR UPDATE`;

  const antes = await tx.plantao.findUnique({ where: { id: plantaoId } });
  if (!antes) throw erroNaoEncontrado('Plantão não encontrado.');

  const ciclo = await tx.ciclo.findUnique({ where: { id: antes.cicloId } });
  if (!ciclo) throw erroNaoEncontrado('Plantão não encontrado.');
  if (ciclo.status === 'FECHADO') {
    throw erroPlantao409('Este ciclo está fechado.', 'CICLO_FECHADO');
  }

  // 2. `vagasTotais < vagasOcupadas` → 409 (RN-26).
  if (input.vagasTotais !== undefined && input.vagasTotais < antes.vagasOcupadas) {
    throw erroPlantao409('O número de vagas não pode ficar abaixo das já ocupadas.', 'VAGAS_MENOR_QUE_OCUPADAS');
  }

  const horarioMudou = input.horaInicio !== undefined || input.horaFim !== undefined;
  const marcacoesConfirmadas = horarioMudou
    ? await tx.marcacao.findMany({
        where: { plantaoId, status: 'CONFIRMADA' },
        select: { id: true, colaboradorId: true },
      })
    : [];

  if (horarioMudou && marcacoesConfirmadas.length > 0 && input.confirmarImpacto !== true) {
    const detalhes = Object.fromEntries(marcacoesConfirmadas.map((m, i) => [`afetado_${i}`, m.colaboradorId]));
    throw erroPlantao409('Alterar o horário afeta marcações confirmadas — confirme o impacto para prosseguir.', 'IMPACTO_NAO_CONFIRMADO', detalhes);
  }

  if (horarioMudou && marcacoesConfirmadas.length > 0) {
    // 3a. advisory lock de cada colaborador com marcação confirmada, ordem crescente de id.
    const colaboradorIds = [...new Set(marcacoesConfirmadas.map((m) => m.colaboradorId))];
    await travarColaboradoresComBackoff(tx, colaboradorIds);
  }

  const dadosAtualizacao: {
    vagasTotais?: number;
    horaInicio?: Date;
    horaFim?: Date;
    permiteCruzada?: boolean | null;
    observacao?: string;
  } = {};
  if (input.vagasTotais !== undefined) dadosAtualizacao.vagasTotais = input.vagasTotais;
  if (input.permiteCruzada !== undefined) dadosAtualizacao.permiteCruzada = input.permiteCruzada;
  if (input.observacao !== undefined) dadosAtualizacao.observacao = input.observacao;
  if (horarioMudou) {
    dadosAtualizacao.horaInicio = horaParaData(input.horaInicio ?? dataParaHora(antes.horaInicio));
    dadosAtualizacao.horaFim = horaParaData(input.horaFim ?? dataParaHora(antes.horaFim));
  }

  const depois = await tx.plantao.update({ where: { id: plantaoId }, data: dadosAtualizacao });

  if (horarioMudou && marcacoesConfirmadas.length > 0) {
    // 3b. propaga inicioEm/fimEm do plantão para as marcações confirmadas — a
    // trigger `copiar_intervalo_marcacao` só copia em INSERT/UPDATE de
    // `plantao_id`, não quando o intervalo do próprio plantão muda.
    await tx.marcacao.updateMany({
      where: { plantaoId, status: 'CONFIRMADA' },
      data: { inicioEm: depois.inicioEm, fimEm: depois.fimEm },
    });

    // 3c. revalida a jornada de cada colaborador afetado.
    const violacoes: ViolacaoJornada[] = [];
    for (const marcacao of marcacoesConfirmadas) {
      const carregar = criarCarregador(tx, marcacao.id);
      const resultado = await validaJornada(
        carregar,
        marcacao.colaboradorId,
        { inicio: depois.inicioEm, fim: depois.fimEm },
        ciclo.maxBlocosSeguidos,
      );
      if (resultado !== null) {
        violacoes.push({ colaboradorId: marcacao.colaboradorId, resultado });
      }
    }

    if (violacoes.length > 0) {
      const detalhes = Object.fromEntries(violacoes.map((v, i) => [`afetado_${i}`, `${v.colaboradorId}:${v.resultado}`]));
      throw erroPlantao409(
        'A alteração de horário formaria jornada inválida para colaboradores com marcação confirmada.',
        'EXCEDE_JORNADA',
        detalhes,
      );
    }
  }

  // 4. Auditar antes → depois.
  await registrarAuditoria(tx, {
    atorTipo: 'ADMIN',
    atorId: ctx.atorId,
    acao: 'PLANTAO_ALTERADO',
    entidade: 'plantao',
    entidadeId: plantaoId,
    payload: { antes, depois },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  // 5. Broadcast — sem infraestrutura de Realtime entregue ainda (ver `./criar.ts`).

  return depois;
}
