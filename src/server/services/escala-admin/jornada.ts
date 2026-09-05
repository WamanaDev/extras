/**
 * Revalidação de jornada ao alterar um dia de `escala_dia` para um código com
 * `ocupaHorario = true` (`API-ADM-ESC-002`, passo 5; `API-ADM-ESC-003`, passo
 * 5). `F` → `D`/`FT` pode criar 36h com extras já marcadas em volta — DOM-002.
 *
 * Não reimplementa a regra: monta o bloco do dia (`@/lib/escala/blocos`,
 * `blocoDoTurno`), carrega os blocos vizinhos do colaborador via um adaptador
 * de banco e delega a decisão a `validaJornada`
 * (`@/server/services/jornada.ts`, já entregue por `DOM-002`/Onda 0) — mesmo
 * caminho que a UI usaria para antecipar o bloqueio. A decisão final
 * continua sendo do banco (`FN-004`), mas como a rota já está numa transação
 * que vai gravar a troca, recusar aqui evita a escrita antes de chegar ao
 * banco (e produz a mensagem em português exigida pelo contrato).
 */
import { ancoraVigente, type TrocaEscala, type Turno } from '@/lib/escala/ancora';
import { blocoDoTurno, type Bloco, type ResultadoValidacaoJornada } from '@/lib/escala/blocos';
import { validaJornada } from '@/server/services/jornada';
import type { ClienteTransacao } from '@/server/db/tx';

export interface ColaboradorParaJornada {
  escalaAncora: Date;
  escalaPeriodo: number;
  turnoPadrao: Turno;
}

/** Linha de `escala_dia` mínima necessária para reconstruir um bloco ocupado. */
export interface LinhaEscalaDia {
  id: string;
  data: Date;
  presenca: boolean;
  ocupaHorario: boolean;
}

export interface LinhaMarcacaoConfirmada {
  inicioEm: Date;
  fimEm: Date;
}

/** Porta de acesso a dados — implementação real consulta o Prisma; testes injetam fakes. */
export interface FonteBlocosOcupados {
  buscarEscalaDia(janela: { de: Date; ate: Date }, excluirId: string | undefined): Promise<LinhaEscalaDia[]>;
  buscarMarcacoesConfirmadas(janela: { de: Date; ate: Date }): Promise<LinhaMarcacaoConfirmada[]>;
}

/** Implementação real da porta acima, via Prisma (`tx`, dentro da transação da rota). */
export function fonteBlocosOcupadosPrisma(tx: ClienteTransacao, colaboradorId: string): FonteBlocosOcupados {
  return {
    async buscarEscalaDia(janela, excluirId) {
      const linhas = await tx.escalaDia.findMany({
        where: {
          colaboradorId,
          ...(excluirId ? { id: { not: excluirId } } : {}),
          data: { gte: janela.de, lte: janela.ate },
        },
        select: { id: true, data: true, codigoEscala: { select: { presenca: true, ocupaHorario: true } } },
      });
      return linhas.map((l) => ({ id: l.id, data: l.data, presenca: l.codigoEscala.presenca, ocupaHorario: l.codigoEscala.ocupaHorario }));
    },
    async buscarMarcacoesConfirmadas(janela) {
      const linhas = await tx.marcacao.findMany({
        where: {
          colaboradorId,
          status: 'CONFIRMADA',
          inicioEm: { lt: janela.ate },
          fimEm: { gt: janela.de },
        },
        select: { inicioEm: true, fimEm: true },
      });
      return linhas;
    },
  };
}

/**
 * Implementação em memória da mesma porta `FonteBlocosOcupados` — usada
 * quando quem chama já carregou um superconjunto das linhas/marcações de
 * ANTEMÃO (uma única consulta cobrindo toda a janela de um lote), em vez de
 * uma consulta por dia. Filtra em JS com exatamente o mesmo critério das
 * queries Prisma de `fonteBlocosOcupadosPrisma` — resultado idêntico, sem
 * round-trip ao banco por chamada.
 *
 * Achado em uso real (`_conflitos.md`): `API-ADM-ESC-003` (lote) chama
 * `revalidarJornadaDoDia` uma vez por dia do intervalo — um lote de 15 dias
 * fazia 30 consultas sequenciais ao Postgres (2 por dia, via
 * `fonteBlocosOcupadosPrisma`), o suficiente para estourar um timeout contra
 * um banco remoto (Supabase) e o lote inteiro falhar com 500.
 */
export function fonteBlocosOcupadosEmMemoria(escalaDias: LinhaEscalaDia[], marcacoes: LinhaMarcacaoConfirmada[]): FonteBlocosOcupados {
  return {
    async buscarEscalaDia(janela, excluirId) {
      return escalaDias.filter(
        (l) => (excluirId === undefined || l.id !== excluirId) && l.data.getTime() >= janela.de.getTime() && l.data.getTime() <= janela.ate.getTime(),
      );
    },
    async buscarMarcacoesConfirmadas(janela) {
      return marcacoes.filter((m) => m.inicioEm.getTime() < janela.ate.getTime() && m.fimEm.getTime() > janela.de.getTime());
    },
  };
}

/** Monta os blocos ocupados (base + extras) de uma janela — mesmo critério de `01-dominio/blocos-jornada.md`, "O que entra na conta". */
async function carregarBlocosDaJanela(
  fonte: FonteBlocosOcupados,
  colaborador: ColaboradorParaJornada,
  trocas: TrocaEscala[],
  janela: { de: Date; ate: Date },
  excluirEscalaDiaId: string | undefined,
): Promise<Bloco[]> {
  const [linhasEscala, marcacoes] = await Promise.all([
    fonte.buscarEscalaDia(janela, excluirEscalaDiaId),
    fonte.buscarMarcacoesConfirmadas(janela),
  ]);

  const blocosDaEscala = linhasEscala
    .filter((l) => l.presenca || l.ocupaHorario)
    .map((l) => blocoDoTurno(l.data, ancoraVigente(colaborador, trocas, l.data).turno));

  const blocosDeExtras = marcacoes.map((m) => ({ inicio: m.inicioEm, fim: m.fimEm }));

  return [...blocosDaEscala, ...blocosDeExtras];
}

/**
 * `revalidarJornadaDoDia` — o dia `data` passa a ter `ocupaHorario = true`
 * (código novo); verifica se isso encadeia mais que `maxBlocos` blocos de
 * 12h contíguos para o colaborador. `excluirEscalaDiaId` evita contar a
 * própria linha que está sendo alterada como um bloco "vizinho" dela mesma.
 */
export async function revalidarJornadaDoDia(params: {
  fonte: FonteBlocosOcupados;
  colaborador: ColaboradorParaJornada;
  trocas: TrocaEscala[];
  data: Date;
  maxBlocos: number;
  excluirEscalaDiaId?: string;
}): Promise<ResultadoValidacaoJornada> {
  const { fonte, colaborador, trocas, data, maxBlocos, excluirEscalaDiaId } = params;
  const turno = ancoraVigente(colaborador, trocas, data).turno;
  const novo = blocoDoTurno(data, turno);

  // `fonte` já está fechada sobre o colaborador (ver `fonteBlocosOcupadosPrisma`)
  // — o `colaboradorId` do parâmetro de `CarregarBlocosOcupados` é ignorado
  // aqui de propósito, só existe para casar a assinatura de `validaJornada`.
  const carregarBlocosOcupados = async (_colaboradorId: string, janelaChamada: { de: Date; ate: Date }) =>
    carregarBlocosDaJanela(fonte, colaborador, trocas, janelaChamada, excluirEscalaDiaId);
  return validaJornada(carregarBlocosOcupados, '', novo, maxBlocos);
}
