/**
 * API-AUTH-003 — `POST /api/auth/colaborador/definir-pin`: lógica de negócio.
 *
 * Fluxo (`API-AUTH-003-definir-pin.md`, "Fluxo"):
 * 1. Validar token e estado (`pinHash IS NULL` ou `precisaTrocarPin = true`)
 *    — a validação do token é da rota; o estado (verdade do banco, nunca do
 *    token — `AGENTS.md`, "Nunca confie no cliente") é checado aqui.
 * 2. Validar força do PIN (RN-30, `./pin.ts`)
 * 3. Hash argon2id + `PIN_PEPPER` (`./credenciais.ts`)
 * 4. Gravar, marcar `pinDefinidoEm`, `precisaTrocarPin = false`
 * 5. Auditar `PIN_DEFINIDO`
 * 6. Criar sessão
 *
 * Passos 4–6 numa transação (`ACID`).
 */
import { hashPin } from './credenciais';
import { validarForcaPin } from './pin';
import { erroCredenciaisInvalidas, erroPinJaDefinido, erroPinFraco, erroPinNaoConfere } from '@/server/http/erros';

export interface ColaboradorParaDefinirPin {
  id: string;
  nome: string;
  matricula: string;
  ativo: boolean;
  pinHash: string | null;
  precisaTrocarPin: boolean;
  rtCodigo: string;
  rtNome: string;
}

export interface SessaoEmitida {
  token: string;
  expiraEm: Date;
}

export interface TransacaoDefinirPin {
  /** Grava `pinHash`, `pinDefinidoEm`, `precisaTrocarPin = false`, audita `PIN_DEFINIDO` e cria a sessão — tudo na mesma transação. */
  gravarPinEcriarSessao(pinHash: string): Promise<SessaoEmitida>;
}

export interface RepositorioDefinirPin {
  buscarPorId(colaboradorId: string): Promise<ColaboradorParaDefinirPin | null>;
  emTransacao<T>(colaboradorId: string, callback: (tx: TransacaoDefinirPin) => Promise<T>): Promise<T>;
}

export interface ParametrosDefinirPin {
  colaboradorId: string;
  pin: string;
  confirmacao: string;
}

export interface ColaboradorRespostaDefinirPin {
  id: string;
  nome: string;
  matricula: string;
  rt: { codigo: string; nome: string };
}

export interface ResultadoDefinirPin {
  token: string;
  colaborador: ColaboradorRespostaDefinirPin;
  expiraEm: string;
}

export async function processarDefinirPin(repo: RepositorioDefinirPin, params: ParametrosDefinirPin): Promise<ResultadoDefinirPin> {
  const colaborador = await repo.buscarPorId(params.colaboradorId);
  if (!colaborador || !colaborador.ativo) {
    throw erroCredenciaisInvalidas();
  }

  // Verdade do banco, não do token (`AGENTS.md`, "Nunca confie no cliente").
  if (colaborador.pinHash !== null && !colaborador.precisaTrocarPin) {
    throw erroPinJaDefinido();
  }

  if (params.pin !== params.confirmacao) {
    throw erroPinNaoConfere();
  }

  const motivoFraco = validarForcaPin(params.pin, colaborador.matricula);
  if (motivoFraco !== null) {
    throw erroPinFraco();
  }

  const pinHash = await hashPin(params.pin);

  const sessao = await repo.emTransacao(colaborador.id, (tx) => tx.gravarPinEcriarSessao(pinHash));

  return {
    token: sessao.token,
    colaborador: {
      id: colaborador.id,
      nome: colaborador.nome,
      matricula: colaborador.matricula,
      rt: { codigo: colaborador.rtCodigo, nome: colaborador.rtNome },
    },
    expiraEm: sessao.expiraEm.toISOString(),
  };
}
