/**
 * API-ADM-REL-001 — `GET /api/admin/relatorios/ciclo/:id`.
 *
 * Consolidado do ciclo: horas por colaborador, ocupação por RT, cruzadas,
 * ausências. Lógica pura de agregação, sem HTTP — a rota
 * (`src/app/api/admin/relatorios/ciclo/[id]/route.ts`) só faz a leitura de
 * `params`/injeção do cliente Prisma e devolve o resultado direto (sem
 * wrapper, `CONVENTIONS.md`).
 *
 * Reaproveita `cobertura_ciclo` (`prisma/migrations/20260101000007_funcoes`,
 * já implementada — FN-009) para os déficits por RT em vez de recalcular a
 * mesma varredura dia×RT×turno em TypeScript.
 *
 * ## ACID
 * "Leitura numa transação; agregados de instantes diferentes não fecham" —
 * toda a leitura roda dentro de `emTransacao` (`src/server/db/tx.ts`, reuso
 * do único ponto de entrada de transação do projeto), com um teto de tempo
 * maior que o padrão (25s) porque o teste de aceitação #4 tolera até 3s para
 * 80 colaboradores mas o `statement_timeout` do role `app_readonly` é 30s
 * (`prisma/migrations/20260101000009_roles_grants/migration.sql`) — a
 * transação da aplicação não deve ser o gargalo mais apertado.
 *
 * ## CIA
 * "C: só admin. Não inclui `observacao` de ausência." — `escalaDia` é lido
 * só para contagem/horas (`codigoEscala.presenca`), nunca `observacao` (essa
 * coluna é restrita ao admin *dentro* da tela de escala, mas mesmo o admin
 * não precisa dela neste relatório agregado — nenhum campo do contrato a
 * expõe).
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao, type ClienteTransacao } from '@/server/db/tx';
import { erroNaoEncontrado } from '@/server/http/erros';

export interface LinhaPorColaborador {
  id: string;
  nome: string;
  matricula: string;
  rt: string;
  plantoesBase: number;
  extras: number;
  extrasCruzadas: number;
  horasBase: number;
  horasExtras: number;
  folgas: number;
  limite: number;
  aproveitamento: number;
}

export interface LinhaPorRt {
  rt: string;
  vagasOfertadas: number;
  vagasPreenchidas: number;
  taxaOcupacao: number;
  deficits: number;
}

export interface ResumoRelatorioCiclo {
  colaboradores: number;
  extrasTotais: number;
  horasTotais: number;
  vagasNaoPreenchidas: number;
}

export interface RelatorioCiclo {
  porColaborador: LinhaPorColaborador[];
  porRt: LinhaPorRt[];
  resumo: ResumoRelatorioCiclo;
}

/** FUND-002: "Turno de 12h" — usado quando o intervalo não pode ser calculado a partir de `horaInicio`/`horaFim` (ex.: código de ausência sem horário). */
const HORAS_TURNO_PADRAO = 12;

function horasEntre(inicio: Date | null, fim: Date | null): number {
  if (!inicio || !fim) return HORAS_TURNO_PADRAO;
  let diffMs = fim.getTime() - inicio.getTime();
  if (diffMs <= 0) diffMs += 24 * 60 * 60 * 1000; // turno noturno cruza a meia-noite (só a hora é armazenada, sem data)
  return diffMs / (60 * 60 * 1000);
}

interface LinhaCobertura {
  rt_codigo: string;
  deficit: number;
}

export async function montarRelatorioCiclo(prisma: PrismaClient, cicloId: string): Promise<RelatorioCiclo> {
  return emTransacao(prisma, (tx) => construirRelatorio(tx, cicloId), { timeoutMs: 25_000, maxWaitMs: 5_000 });
}

async function construirRelatorio(tx: ClienteTransacao, cicloId: string): Promise<RelatorioCiclo> {
  const ciclo = await tx.ciclo.findUnique({ where: { id: cicloId } });
  if (!ciclo) {
    throw erroNaoEncontrado('Ciclo não encontrado.');
  }

  const [escalas, marcacoes, participacoes, rts, plantoes, cobertura] = await Promise.all([
    tx.escalaDia.findMany({ where: { cicloId }, include: { codigoEscala: true } }),
    tx.marcacao.findMany({
      where: { status: 'CONFIRMADA', plantao: { cicloId } },
      include: { plantao: true },
    }),
    tx.participacaoCiclo.findMany({ where: { cicloId } }),
    tx.rt.findMany({ where: { ativo: true } }),
    tx.plantao.findMany({ where: { cicloId, ativo: true }, include: { rt: true } }),
    tx.$queryRaw<LinhaCobertura[]>`SELECT rt_codigo, deficit FROM cobertura_ciclo(${cicloId}::uuid)`,
  ]);

  interface Acumulador {
    plantoesBase: number;
    folgas: number;
    horasBase: number;
    extras: number;
    extrasCruzadas: number;
    horasExtras: number;
  }
  const acumuladores = new Map<string, Acumulador>();
  function acumulador(colaboradorId: string): Acumulador {
    let acc = acumuladores.get(colaboradorId);
    if (!acc) {
      acc = { plantoesBase: 0, folgas: 0, horasBase: 0, extras: 0, extrasCruzadas: 0, horasExtras: 0 };
      acumuladores.set(colaboradorId, acc);
    }
    return acc;
  }

  // Teste #2 (canceladas não contam) já satisfeito pelo filtro `status: 'CONFIRMADA'` acima.
  for (const escala of escalas) {
    const acc = acumulador(escala.colaboradorId);
    if (escala.codigoEscala.presenca) {
      acc.plantoesBase += 1;
      acc.horasBase += horasEntre(escala.horaInicio, escala.horaFim);
    } else {
      acc.folgas += 1;
    }
  }

  // Teste #3 (cruzadas contadas separadamente): `extras` soma todo mundo,
  // `extrasCruzadas` é o subconjunto com `cruzada = true` — não se excluem.
  for (const marcacao of marcacoes) {
    const acc = acumulador(marcacao.colaboradorId);
    acc.extras += 1;
    if (marcacao.cruzada) acc.extrasCruzadas += 1;
    acc.horasExtras += marcacao.plantao.cargaHoras;
  }

  const limitesPorColaborador = new Map(participacoes.map((p) => [p.colaboradorId, p.limiteOverride] as const));

  const idsColaboradores = [...acumuladores.keys()];
  const colaboradores = idsColaboradores.length
    ? await tx.colaborador.findMany({ where: { id: { in: idsColaboradores } }, include: { rt: true } })
    : [];

  const porColaborador: LinhaPorColaborador[] = colaboradores
    .map((colab) => {
      const acc = acumulador(colab.id);
      const limite = limitesPorColaborador.get(colab.id) ?? ciclo.limitePadrao;
      const aproveitamento = limite > 0 ? acc.extras / limite : 0;
      return {
        id: colab.id,
        nome: colab.nome,
        matricula: colab.matricula,
        rt: colab.rt.nome,
        plantoesBase: acc.plantoesBase,
        extras: acc.extras,
        extrasCruzadas: acc.extrasCruzadas,
        horasBase: acc.horasBase,
        horasExtras: acc.horasExtras,
        folgas: acc.folgas,
        limite,
        aproveitamento,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  interface AcumuladorRt {
    vagasOfertadas: number;
    vagasPreenchidas: number;
  }
  const vagasPorRt = new Map<string, AcumuladorRt>();
  for (const plantao of plantoes) {
    const chave = plantao.rt.nome;
    let acc = vagasPorRt.get(chave);
    if (!acc) {
      acc = { vagasOfertadas: 0, vagasPreenchidas: 0 };
      vagasPorRt.set(chave, acc);
    }
    acc.vagasOfertadas += plantao.vagasTotais;
    acc.vagasPreenchidas += plantao.vagasOcupadas;
  }

  const deficitsPorRt = new Map<string, number>();
  for (const linha of cobertura) {
    deficitsPorRt.set(linha.rt_codigo, (deficitsPorRt.get(linha.rt_codigo) ?? 0) + Number(linha.deficit));
  }

  const porRt: LinhaPorRt[] = rts
    .map((rt) => {
      const vagas = vagasPorRt.get(rt.nome) ?? { vagasOfertadas: 0, vagasPreenchidas: 0 };
      return {
        rt: rt.nome,
        vagasOfertadas: vagas.vagasOfertadas,
        vagasPreenchidas: vagas.vagasPreenchidas,
        taxaOcupacao: vagas.vagasOfertadas > 0 ? vagas.vagasPreenchidas / vagas.vagasOfertadas : 0,
        deficits: deficitsPorRt.get(rt.nome) ?? 0,
      };
    })
    .sort((a, b) => a.rt.localeCompare(b.rt, 'pt-BR'));

  const extrasTotais = porColaborador.reduce((soma, linha) => soma + linha.extras, 0);
  const horasTotais = porColaborador.reduce((soma, linha) => soma + linha.horasBase + linha.horasExtras, 0);
  const vagasNaoPreenchidas = porRt.reduce((soma, linha) => soma + (linha.vagasOfertadas - linha.vagasPreenchidas), 0);

  return {
    porColaborador,
    porRt,
    resumo: {
      colaboradores: porColaborador.length,
      extrasTotais,
      horasTotais,
      vagasNaoPreenchidas,
    },
  };
}
