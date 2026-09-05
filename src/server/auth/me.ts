/**
 * API-AUTH-005 — `GET /api/auth/me`: lógica de negócio.
 *
 * Devolve o ator da sessão (já resolvido por `defineHandler`/`ator: 'QUALQUER'`
 * — este módulo nunca autentica, só formata a resposta e decide a renovação
 * deslizante do colaborador).
 *
 * Fluxo (`API-AUTH-005-me.md`, "Fluxo"):
 * 1. Validar sessão — feito pelo pipeline antes de chegar aqui.
 * 2. Renovar deslizante se restar < 2h e o teto de 12h não foi atingido —
 *    `calcularRenovacaoSessao` (`./sessao.ts`), só se aplica a colaborador:
 *    sessão de admin é gerenciada pelo Supabase Auth, fora do nosso controle
 *    (`API-AUTH-006`, item (e) de `_conflitos.md`).
 * 3. Atualizar `ultimoUsoEm` — **pendência**: `sessao_colaborador` não tem essa
 *    coluna no schema atual (`prisma/schema.prisma`, model `SessaoColaborador`
 *    só tem `criadoEm`/`expiraEm`/`revogadaEm`/`ip`/`userAgent`). Adicionar a
 *    coluna é migração de schema, fora do escopo de `04-api/auth/*` (dono é
 *    `03-banco/modelo-dados.md`). Resolução: a renovação de `expiraEm`
 *    acontece normalmente; `ultimoUsoEm` fica pendente de migração — ver
 *    `_conflitos.md`.
 *
 * **C:** nunca retorna hash de PIN — os tipos de retorno abaixo não têm esse
 * campo, então é estruturalmente impossível vazá-lo por engano nesta função.
 */
import type { AtorAdmin, AtorColaborador } from '@/server/http/handler';
import { erroNaoAutenticado } from '@/server/http/erros';
import { calcularRenovacaoSessao } from './sessao';

export interface ColaboradorParaMe {
  id: string;
  nome: string;
  matricula: string;
  rtCodigo: string;
  rtNome: string;
}

export interface SessaoParaMe {
  criadoEm: Date;
  expiraEm: Date;
}

export interface RepositorioMe {
  buscarColaborador(colaboradorId: string): Promise<ColaboradorParaMe | null>;
  buscarSessao(sessaoId: string): Promise<SessaoParaMe | null>;
  /** Só chamado quando `calcularRenovacaoSessao` decide renovar. */
  renovarSessao(sessaoId: string, novaExpiraEm: Date): Promise<void>;
}

export interface RespostaMeColaborador {
  tipo: 'COLABORADOR';
  colaborador: { id: string; nome: string; matricula: string; rt: { codigo: string; nome: string } };
  expiraEm: string;
}

export interface RespostaMeAdmin {
  tipo: 'ADMIN';
  admin: { id: string; email: string | null; nome: string | null };
}

export type RespostaMe = RespostaMeColaborador | RespostaMeAdmin;

export async function processarMe(
  repo: RepositorioMe,
  ator: AtorColaborador | AtorAdmin,
  agora: Date,
): Promise<RespostaMe> {
  if (ator.tipo === 'ADMIN') {
    return { tipo: 'ADMIN', admin: { id: ator.adminId, email: ator.email, nome: ator.nome ?? null } };
  }

  const [colaborador, sessao] = await Promise.all([
    repo.buscarColaborador(ator.colaboradorId),
    repo.buscarSessao(ator.sessaoId),
  ]);

  // Sessão validada pelo pipeline momentos antes — sumiço aqui seria uma
  // condição de corrida rara (revogada/expirada entre a autenticação e este
  // ponto); trata como sessão inválida, sem inventar dado.
  if (!colaborador || !sessao) {
    throw erroNaoAutenticado();
  }

  let expiraEm = sessao.expiraEm;
  const renovada = calcularRenovacaoSessao(sessao, agora);
  if (renovada !== null) {
    await repo.renovarSessao(ator.sessaoId, renovada);
    expiraEm = renovada;
  }

  return {
    tipo: 'COLABORADOR',
    colaborador: {
      id: colaborador.id,
      nome: colaborador.nome,
      matricula: colaborador.matricula,
      rt: { codigo: colaborador.rtCodigo, nome: colaborador.rtNome },
    },
    expiraEm: expiraEm.toISOString(),
  };
}
