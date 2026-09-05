/**
 * API-AUTH-001 — `POST /api/auth/colaborador/login`: lógica de negócio.
 *
 * Separado de `src/app/api/auth/colaborador/login/route.ts` para ser
 * testável sem Postgres real (mesmo padrão de `src/server/services/jornada.ts`
 * — porta de acesso a dados injetada, `RepositorioLogin`). A rota real
 * implementa `RepositorioLogin` em cima do Prisma singleton + `emTransacao`
 * (`SEC-ACID`).
 *
 * **Decisão de design (remoção de CPF, ver tarefa de migração de login):**
 * o fluxo original de `API-AUTH-001-login.md` autenticava a etapa 1 com
 * matrícula + CPF (CPF fazia o papel de "algo que o colaborador tem", vindo
 * de um documento oficial) para então emitir `tokenParcial` e seguir para
 * `/pin` (etapa 2, `validar-pin.ts`) — um verdadeiro segundo fator. Com o CPF
 * removido do sistema, não sobra nenhum segredo distinto do PIN para esta
 * etapa: um colaborador que já definiu PIN deve autenticar-se por
 * matrícula+PIN em uma única chamada — isso já existe em `login-rapido.ts`
 * (aprovado explicitamente pelo usuário, ver seu docstring).
 *
 * Este módulo fica, portanto, restrito ao caso que `login-rapido.ts`
 * deliberadamente recusa: **primeiro acesso**, quando `pinHash` ainda é
 * `null` e não há PIN nenhum para comparar. Aqui a matrícula sozinha
 * (identificador atribuído pelo RH, não uma senha) é o bootstrap que
 * libera um `tokenParcial` de escopo `pin-pendente`, usado só para chamar
 * `/definir-pin`. Qualquer matrícula que já tenha PIN definido é tratada
 * como falha aqui (mesmo código de erro, mesmo custo de tempo) — a intenção
 * é sinalizar "use login rápido", sem criar um oráculo de enumeração.
 *
 * Fluxo:
 * 1. (rate limit é responsabilidade da rota — `defineHandler` + checagem
 *    manual do escopo `login_matricula`, ver `route.ts`)
 * 2. Buscar colaborador por matrícula
 * 3. Se não existir, verificar contra hash dummy fixo mesmo assim (tempo
 *    constante — `compararComHashDummy`, `SEC-CONF`)
 * 4. Se existir mas já tiver `pinHash` definido, mesma defesa de tempo
 *    constante e mesmo erro genérico — este endpoint não serve para login
 *    recorrente (isso é `login-rapido.ts`)
 * 5. Registrar em `tentativa_login` (sempre, sucesso ou falha)
 * 6. Falha → incrementa `tentativasFalhas`; ao atingir 5, grava `bloqueadoAte`
 * 7. Sucesso (primeiro acesso) → zera contador, emite `tokenParcial`
 *
 * Passos 5–7 na mesma transação (`ACID` da spec) — nunca dois `UPDATE`
 * separados.
 */
import { compararComHashDummy } from './credenciais';
import { emitirTokenParcial } from './token-parcial';
import { erroCredenciaisInvalidas, erroContaBloqueada, erroColaboradorInativo } from '@/server/http/erros';

export const LIMITE_TENTATIVAS_FALHAS = 5;
export const DURACAO_BLOQUEIO_MS = 15 * 60 * 1000;

export interface ColaboradorParaLogin {
  id: string;
  ativo: boolean;
  bloqueadoAte: Date | null;
  tentativasFalhas: number;
  /** `null` → primeiro acesso, único caso que este módulo autentica com sucesso. */
  pinHash: string | null;
}

export interface DadosTentativa {
  colaboradorId: string | null;
  matricula: string;
  sucesso: boolean;
  motivo: string | null;
  ip: string;
  userAgent: string;
}

export interface DadosAtualizacaoFalha {
  tentativasFalhas: number;
  bloqueadoAte: Date | null;
}

/** Operações dentro da transação (passos 5–7 — `ACID`). */
export interface TransacaoLogin {
  registrarTentativa(dados: DadosTentativa): Promise<void>;
  atualizarAposFalha(colaboradorId: string, dados: DadosAtualizacaoFalha): Promise<void>;
  atualizarAposSucesso(colaboradorId: string): Promise<void>;
}

export interface RepositorioLogin {
  buscarPorMatricula(matricula: string): Promise<ColaboradorParaLogin | null>;
  emTransacao<T>(callback: (tx: TransacaoLogin) => Promise<T>): Promise<T>;
}

export interface ParametrosLogin {
  matricula: string;
  ip: string;
  userAgent: string;
  agora: Date;
}

export interface ResultadoLogin {
  tokenParcial: string;
  precisaDefinirPin: boolean;
  expiraEm: string;
}

export async function processarLogin(repo: RepositorioLogin, params: ParametrosLogin): Promise<ResultadoLogin> {
  const colaborador = await repo.buscarPorMatricula(params.matricula);

  // Matrícula inexistente: verifica contra hash dummy (tempo constante,
  // SEC-CONF "Enumeração") e registra a tentativa mesmo sem colaborador —
  // `tentativa_login.colaborador_id` aceita NULL para este caso.
  if (!colaborador) {
    await compararComHashDummy();
    await repo.emTransacao(async (tx) => {
      await tx.registrarTentativa({
        colaboradorId: null,
        matricula: params.matricula,
        sucesso: false,
        motivo: 'MATRICULA_INEXISTENTE',
        ip: params.ip,
        userAgent: params.userAgent,
      });
    });
    throw erroCredenciaisInvalidas();
  }

  if (!colaborador.ativo) {
    throw erroColaboradorInativo();
  }

  if (colaborador.bloqueadoAte !== null && colaborador.bloqueadoAte.getTime() > params.agora.getTime()) {
    throw erroContaBloqueada();
  }

  // Já passou pelo primeiro acesso — este endpoint não autentica login
  // recorrente (isso é `login-rapido.ts`). Mesma defesa de tempo constante e
  // mesmo código de erro do caso "matrícula inexistente", para não vazar se a
  // matrícula existe/já tem PIN.
  const primeiroAcesso = colaborador.pinHash === null;
  if (!primeiroAcesso) {
    await compararComHashDummy();
  }

  await repo.emTransacao(async (tx) => {
    await tx.registrarTentativa({
      colaboradorId: colaborador.id,
      matricula: params.matricula,
      sucesso: primeiroAcesso,
      motivo: primeiroAcesso ? null : 'PIN_JA_DEFINIDO',
      ip: params.ip,
      userAgent: params.userAgent,
    });

    if (primeiroAcesso) {
      await tx.atualizarAposSucesso(colaborador.id);
    } else {
      const tentativasFalhas = colaborador.tentativasFalhas + 1;
      const bloqueadoAte =
        tentativasFalhas >= LIMITE_TENTATIVAS_FALHAS ? new Date(params.agora.getTime() + DURACAO_BLOQUEIO_MS) : null;
      await tx.atualizarAposFalha(colaborador.id, { tentativasFalhas, bloqueadoAte });
    }
  });

  if (!primeiroAcesso) {
    throw erroCredenciaisInvalidas();
  }

  const emitido = emitirTokenParcial(colaborador.id, true, params.agora);
  return {
    tokenParcial: emitido.token,
    precisaDefinirPin: true,
    expiraEm: emitido.expiraEm.toISOString(),
  };
}
