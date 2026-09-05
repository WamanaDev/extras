/**
 * API-AUTH-002 — `POST /api/auth/colaborador/pin`: lógica de negócio.
 *
 * Etapa 2 do login. Recebe o `sub` (colaboradorId) já extraído de um
 * `tokenParcial` válido e consumido (`token-parcial.ts` — a rota chama
 * `consumirTokenParcial` antes de chegar aqui; este módulo não sabe nada de
 * JWT). Mesmo padrão de dependência injetada de `login.ts`/`jornada.ts` —
 * testável sem Postgres real.
 *
 * Fluxo (`API-AUTH-002-pin.md`, "Fluxo", passos 2–6 — o passo 1, validar o
 * `tokenParcial`, é responsabilidade da rota):
 * 2. Rate limit por matrícula (rota, antes de chamar este módulo)
 * 3. `argon2.verify(pinHash, pin + PIN_PEPPER)` (`verificarPin`)
 * 4. Registrar `tentativa_login` e auditar `LOGIN_SUCESSO`/`LOGIN_FALHA`
 * 5. Sucesso: cria sessão (token 32 bytes, SHA-256 no banco, 8h)
 * 6. Zera `tentativasFalhas`
 *
 * Passos 4–6 na mesma transação (`ACID` da spec).
 */
import { verificarPin } from './credenciais';
import { erroCredenciaisInvalidas, erroContaBloqueada, erroPinNaoDefinido } from '@/server/http/erros';

export const LIMITE_TENTATIVAS_FALHAS = 5;
export const DURACAO_BLOQUEIO_MS = 15 * 60 * 1000;

export interface ColaboradorParaPin {
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

export interface TransacaoPin {
  registrarTentativaEAuditoria(sucesso: boolean): Promise<void>;
  atualizarAposFalha(dados: { tentativasFalhas: number; bloqueadoAte: Date | null }): Promise<void>;
  /** Zera `tentativasFalhas`, cria a sessão e audita `LOGIN_SUCESSO` — tudo na mesma transação (`ACID`). */
  atualizarAposSucessoComSessao(): Promise<SessaoEmitida>;
}

export interface RepositorioPin {
  buscarPorId(colaboradorId: string): Promise<ColaboradorParaPin | null>;
  emTransacao<T>(colaboradorId: string, callback: (tx: TransacaoPin) => Promise<T>): Promise<T>;
}

export interface ParametrosPin {
  colaboradorId: string;
  pin: string;
  agora: Date;
}

export interface ColaboradorRespostaPin {
  id: string;
  nome: string;
  matricula: string;
  rt: { codigo: string; nome: string };
}

export interface ResultadoPin {
  token: string;
  colaborador: ColaboradorRespostaPin;
  expiraEm: string;
}

export async function processarPin(repo: RepositorioPin, params: ParametrosPin): Promise<ResultadoPin> {
  const colaborador = await repo.buscarPorId(params.colaboradorId);

  // `tokenParcial` já garantiu que o colaborador existe no momento do login
  // (etapa 1) — se sumiu/desativou entre as duas etapas, trata como
  // credenciais inválidas, nunca vaza detalhe.
  if (!colaborador || !colaborador.ativo) {
    throw erroCredenciaisInvalidas();
  }

  if (colaborador.pinHash === null) {
    throw erroPinNaoDefinido();
  }

  if (colaborador.bloqueadoAte !== null && colaborador.bloqueadoAte.getTime() > params.agora.getTime()) {
    throw erroContaBloqueada();
  }

  const pinOk = await verificarPin(params.pin, colaborador.pinHash);

  const sessaoOuNull = await repo.emTransacao(colaborador.id, async (tx) => {
    await tx.registrarTentativaEAuditoria(pinOk);

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
