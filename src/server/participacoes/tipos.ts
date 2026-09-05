/**
 * `API-ADM-PAR-001`/`API-ADM-PAR-002` — tipos e porta de acesso a dados
 * compartilhados pelas duas rotas de `admin-participacoes`.
 *
 * A lógica de negócio (`definir.ts`, `lote.ts`) não importa `@prisma/client`
 * diretamente — só esta porta (`PortaParticipacoes`), no mesmo espírito de
 * `src/server/services/jornada.ts` (`CarregarBlocosOcupados`): a decisão de
 * negócio fica testável com um fake em memória, sem depender do shape exato
 * do client gerado. O adaptador real (`adaptarPrisma`, em cada arquivo de
 * rota) é a única peça que toca `tx: ClienteTransacao` de verdade — é ali que
 * o "mock de Prisma" dos testes de aceitação entra: os testes substituem
 * `PortaParticipacoes` inteira por um fake, o que é equivalente a mockar o
 * Prisma Client na fronteira em que ele é usado.
 */
import type { ClienteTransacao } from '@/server/db/tx';
import type { AtorTipo, AcaoAuditoria } from '@/server/audit/registrar';

export type StatusCicloResumo = 'RASCUNHO' | 'PUBLICADO' | 'FECHADO';
export type TurnoResumo = 'DIURNO' | 'NOTURNO';

export interface CicloResumo {
  id: string;
  status: StatusCicloResumo;
  limitePadrao: number;
}

export interface ColaboradorResumo {
  id: string;
  nome: string;
}

export interface ParticipacaoResumo {
  limiteOverride: number | null;
  permiteCruzada: boolean | null;
  bloqueado: boolean;
  motivo: string | null;
}

/** Estado antes/depois de uma participação, para o payload de auditoria (antes → depois). */
export interface EstadoParticipacaoAuditoria {
  limiteOverride: number | null;
  permiteCruzada: boolean | null;
  bloqueado: boolean;
  motivo: string | null;
}

export interface FiltroLote {
  rtId?: string | undefined;
  turno?: TurnoResumo | undefined;
  colaboradorIds?: string[] | undefined;
}

export interface DadosParticipacao {
  limiteOverride?: number | null | undefined;
  permiteCruzada?: boolean | null | undefined;
  bloqueado?: boolean | undefined;
  motivo?: string | null | undefined;
}

export interface EventoAuditoriaEntrada {
  atorTipo: AtorTipo;
  atorId: string | null;
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId: string | null;
  payload: unknown;
  ip: string;
  userAgent: string;
  requestId: string;
}

/**
 * Porta de acesso a dados exigida pela lógica de negócio de
 * `admin-participacoes`. Toda operação já está "dentro da transação" — quem
 * implementa a porta (o adaptador de rota) é responsável por abrir a
 * transação (`emTransacao`) e passar o `tx` internamente a cada método.
 */
export interface PortaParticipacoes {
  buscarCiclo(cicloId: string): Promise<CicloResumo | null>;
  buscarColaborador(colaboradorId: string): Promise<ColaboradorResumo | null>;
  buscarColaboradoresPorFiltro(filtro: FiltroLote): Promise<ColaboradorResumo[]>;
  buscarParticipacao(cicloId: string, colaboradorId: string): Promise<ParticipacaoResumo | null>;
  /** Marcações `CONFIRMADA` do colaborador nos plantões deste ciclo. */
  contarUsadas(cicloId: string, colaboradorId: string): Promise<number>;
  /** `upsert` — cria se não existir participação, mescla campos informados se existir. */
  salvarParticipacao(cicloId: string, colaboradorId: string, dados: DadosParticipacao): Promise<void>;
  /** Advisory lock transacional de um colaborador (`SEC-ACID`). */
  travarColaborador(colaboradorId: string): Promise<void>;
  /** Advisory locks de vários colaboradores, em ordem crescente de id (`SEC-ACID`, sem deadlock). */
  travarColaboradores(colaboradorIds: readonly string[]): Promise<void>;
  registrarAuditoria(evento: EventoAuditoriaEntrada): Promise<void>;
}

/** Assinatura de `emTransacao` reduzida ao necessário aqui — permite injeção de fake em teste sem tocar `PrismaClient`. */
export type ExecutarEmTransacao = <T>(callback: (tx: ClienteTransacao) => Promise<T>) => Promise<T>;
