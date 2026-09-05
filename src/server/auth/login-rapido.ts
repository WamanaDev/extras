/**
 * Login rápido do colaborador: matrícula + PIN, sem etapa de tokenParcial.
 *
 * NÃO é entregável de `API-AUTH-001`/`API-AUTH-002` (ambas `PRONTA —
 * alteração exige revisão humana`) — é um endpoint adicional, decidido e
 * aprovado explicitamente pelo usuário em conversa (login normal do dia a
 * dia fica mais rápido). Com a remoção do CPF do sistema, este é agora o
 * caminho principal de login recorrente: matrícula identifica, PIN
 * autentica. O fluxo de `login.ts` (`API-AUTH-001`) ficou restrito ao
 * primeiro acesso (quando ainda não há PIN definido) — ver docstring de
 * `login.ts`. Ver `_conflitos.md`.
 *
 * Reaproveita as mesmas peças de `login.ts` (busca por matrícula, contador de
 * falhas/bloqueio) e `validar-pin.ts` (`verificarPin`, criação de sessão) —
 * só funde as duas etapas num único request, sem tokenParcial. Mesma postura
 * anti-enumeração: matrícula inexistente E colaborador sem PIN definido caem
 * no mesmo caminho (hash dummy, erro genérico) — nenhuma resposta desta rota
 * distingue "matrícula não existe" de "matrícula existe mas ainda não
 * definiu PIN", pra não criar um oráculo.
 */
import { compararComHashDummy, verificarPin } from './credenciais';
import { erroCredenciaisInvalidas, erroContaBloqueada, erroColaboradorInativo } from '@/server/http/erros';

export const LIMITE_TENTATIVAS_FALHAS = 5;
export const DURACAO_BLOQUEIO_MS = 15 * 60 * 1000;

export interface ColaboradorParaLoginRapido {
  id: string;
  nome: string;
  matricula: string;
  pinHash: string | null;
  ativo: boolean;
  bloqueadoAte: Date | null;
  tentativasFalhas: number;
  rtCodigo: string;
  rtNome: string;
}

export interface SessaoEmitida {
  token: string;
  expiraEm: Date;
}

export interface TransacaoLoginRapido {
  registrarTentativaEAuditoria(sucesso: boolean, motivo: string | null): Promise<void>;
  atualizarAposFalha(dados: { tentativasFalhas: number; bloqueadoAte: Date | null }): Promise<void>;
  /** Zera `tentativasFalhas`, cria a sessão e audita `LOGIN_SUCESSO` — tudo na mesma transação (ACID). */
  atualizarAposSucessoComSessao(): Promise<SessaoEmitida>;
}

export interface RepositorioLoginRapido {
  buscarPorMatricula(matricula: string): Promise<ColaboradorParaLoginRapido | null>;
  registrarTentativaSemColaborador(matricula: string): Promise<void>;
  emTransacao<T>(colaboradorId: string, callback: (tx: TransacaoLoginRapido) => Promise<T>): Promise<T>;
}

export interface ParametrosLoginRapido {
  matricula: string;
  pin: string;
  agora: Date;
}

export interface ColaboradorRespostaLoginRapido {
  id: string;
  nome: string;
  matricula: string;
  rt: { codigo: string; nome: string };
}

export interface ResultadoLoginRapido {
  token: string;
  colaborador: ColaboradorRespostaLoginRapido;
  expiraEm: string;
}

export async function processarLoginRapido(
  repo: RepositorioLoginRapido,
  params: ParametrosLoginRapido,
): Promise<ResultadoLoginRapido> {
  const colaborador = await repo.buscarPorMatricula(params.matricula);

  // Matrícula inexistente OU colaborador ainda sem PIN definido: mesmo
  // caminho (hash dummy, erro genérico) — ver docstring do arquivo.
  if (!colaborador || colaborador.pinHash === null) {
    await compararComHashDummy();
    await repo.registrarTentativaSemColaborador(params.matricula);
    throw erroCredenciaisInvalidas();
  }

  if (!colaborador.ativo) {
    throw erroColaboradorInativo();
  }

  if (colaborador.bloqueadoAte !== null && colaborador.bloqueadoAte.getTime() > params.agora.getTime()) {
    throw erroContaBloqueada();
  }

  const pinOk = await verificarPin(params.pin, colaborador.pinHash);

  const sessaoOuNull = await repo.emTransacao(colaborador.id, async (tx) => {
    await tx.registrarTentativaEAuditoria(pinOk, pinOk ? null : 'PIN_INCORRETO');

    if (pinOk) {
      return tx.atualizarAposSucessoComSessao();
    }

    const tentativasFalhas = colaborador.tentativasFalhas + 1;
    const bloqueadoAte =
      tentativasFalhas >= LIMITE_TENTATIVAS_FALHAS ? new Date(params.agora.getTime() + DURACAO_BLOQUEIO_MS) : null;
    await tx.atualizarAposFalha({ tentativasFalhas, bloqueadoAte });
    return null;
  });

  if (!pinOk || sessaoOuNull === null) {
    throw erroCredenciaisInvalidas();
  }

  return {
    token: sessaoOuNull.token,
    colaborador: {
      id: colaborador.id,
      nome: colaborador.nome,
      matricula: colaborador.matricula,
      rt: { codigo: colaborador.rtCodigo, nome: colaborador.rtNome },
    },
    expiraEm: sessaoOuNull.expiraEm.toISOString(),
  };
}
