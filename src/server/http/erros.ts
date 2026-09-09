/**
 * API-000 — Catálogo e formato de erro comum a toda rota.
 *
 * Entregável de `specs/04-api/contrato-comum.md`. Duas responsabilidades:
 *
 * 1. `ErroHttp` — o único tipo que um handler de rota deve lançar para
 *    produzir uma resposta de erro controlada (negócio, validação,
 *    autenticação/autorização). Qualquer outro `throw` (erro do Prisma, bug
 *    de programação) é traduzido por `traduzirErro` — o handler nunca monta
 *    a resposta de erro à mão.
 * 2. `traduzirErro` / `formatarRespostaErro` — pipeline de tradução usado por
 *    `./handler.ts` no passo "tradução de erro". SQLSTATE **nunca** é lido
 *    aqui nem em nenhum handler de rota: a tradução de SQLSTATE → erro de API
 *    já existe, centralizada, em `src/server/db/erros.ts` (`erroApiParaPostgres`,
 *    entregável de `03-banco/constraints.md`, seção "Códigos de erro → API").
 *    Este módulo só reaproveita essa tabela e acrescenta a mensagem em
 *    português voltada ao usuário (a tabela de `db/erros.ts` só carrega
 *    `erro`/`http`, não `mensagem` — mensagem para o usuário é preocupação de
 *    API, não de tradução de SQLSTATE).
 *
 * Regras de `contrato-comum.md`, seção "Erros", aplicadas aqui:
 * - Erro de regra de negócio → `409` com `erro` do catálogo.
 * - Recurso de terceiro → `404`, nunca `403` (não vazamos existência) — ver
 *   `erroNaoEncontrado`, cujo doc-comment é explícito sobre esse uso duplo.
 * - SQLSTATE traduzido centralmente por `03-banco/constraints.md` — handler
 *   não lê SQLSTATE (garantido aqui: nenhuma função deste módulo aceita um
 *   código bruto, só o erro capturado, repassado a `erroApiParaPostgres`).
 * - `mensagem` é para o usuário final, em português, sem detalhe técnico.
 * - Nenhuma mensagem contém CPF, matrícula alheia, nome de tabela ou stack.
 */
import { ZodError } from 'zod';
import { erroApiParaPostgres, type ErroApi } from '@/server/db/erros';

/** Códigos de erro que pertencem à infraestrutura comum (pipeline de `defineHandler`), fora do catálogo de negócio de `db/erros.ts`. */
export type CodigoErroInfra =
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'RECURSO_NAO_ENCONTRADO'
  | 'VALIDACAO'
  | 'LIMITE_EXCEDIDO'
  | 'CSRF_INVALIDO'
  | 'CONTENT_TYPE_INVALIDO'
  | 'ERRO_INTERNO';

/**
 * Erro de negócio genérico levantado por um handler de rota que não corresponde a um SQLSTATE mapeado (ex.: regra de domínio verificada em TS antes de tocar o banco).
 *
 * Códigos específicos de domínio, além do genérico `REGRA_DE_NEGOCIO`, são
 * acrescentados aqui por cada spec de `04-api/*` que precisar — extensão
 * aditiva (nunca remove nem redefine um código existente), então não conta
 * como alteração do contrato de `contrato-comum.md` (pipeline/wrapper), só
 * do catálogo de nomes possíveis em `erro`. Ver `_conflitos.md` para o
 * registro desta decisão.
 * - `CICLO_FECHADO`, `IMPACTO_NAO_CONFIRMADO`, `MOTIVO_OBRIGATORIO`,
 *   `LOTE_MUITO_GRANDE`: `API-ADM-PAR-001`/`API-ADM-PAR-002`.
 * - `MATRICULA_JA_EXISTE`, `CPF_INVALIDO`, `ANCORA_INVALIDA`,
 *   `RT_COM_ESCALA_ATIVA`, `VIGENCIA_NO_PASSADO`, `EXCEDE_JORNADA`:
 *   `API-ADM-COL-002`/`003`/`006` (reaproveita `CICLO_FECHADO` e
 *   `IMPACTO_NAO_CONFIRMADO` já acrescentados acima, mesmo significado).
 * - `CREDENCIAIS_INVALIDAS`, `CONTA_BLOQUEADA`, `COLABORADOR_INATIVO`,
 *   `TOKEN_INVALIDO`, `PIN_NAO_DEFINIDO`, `PIN_FRACO`, `PIN_NAO_CONFERE`,
 *   `PIN_JA_DEFINIDO`, `MFA_OBRIGATORIO`: `04-api/auth/API-AUTH-001..006`.
 * - `PLANTAO_INDISPONIVEL`, `JANELA_NAO_ABERTA`, `JANELA_ENCERRADA`,
 *   `CRUZADA_BLOQUEADA`, `EM_AUSENCIA`, `LIMITE_ATINGIDO`,
 *   `CICLO_INEXISTENTE`, `MARCACAO_INEXISTENTE`: `API-ADM-MAR-002`/`003`
 *   (reaproveita `CICLO_FECHADO`/`EXCEDE_JORNADA`/`COLABORADOR_INATIVO`/
 *   `SEM_VAGA`/`CONFLITO_DE_HORARIO` já existentes, mesmo significado).
 *   Diferente dos demais códigos desta lista — que nascem de uma checagem
 *   feita em TS antes de tocar o banco, com `mensagem` passada direto para
 *   `erroDeNegocio` — estes nascem **dentro** de `marcar_extra`/
 *   `cancelar_extra` (FN-005/FN-006, `RAISE EXCEPTION '<código>'`, sem
 *   `ERRCODE` próprio — SQLSTATE genérico `P0001`, texto da mensagem = o
 *   código). Por isso ganham tradução centralizada própria em
 *   `erroDeExcecaoDeFuncao` (abaixo), plugada em `traduzirErro` — nenhuma
 *   rota faz esse parsing na mão. Ver `_conflitos.md` item 12.
 */
export type CodigoErroNegocio =
  | 'REGRA_DE_NEGOCIO'
  | 'CICLO_FECHADO'
  | 'IMPACTO_NAO_CONFIRMADO'
  | 'MOTIVO_OBRIGATORIO'
  | 'LOTE_MUITO_GRANDE'
  | 'MATRICULA_JA_EXISTE'
  | 'CPF_INVALIDO'
  | 'ANCORA_INVALIDA'
  | 'RT_COM_ESCALA_ATIVA'
  | 'VIGENCIA_NO_PASSADO'
  | 'EXCEDE_JORNADA'
  | 'CREDENCIAIS_INVALIDAS'
  | 'CONTA_BLOQUEADA'
  | 'COLABORADOR_INATIVO'
  | 'TOKEN_INVALIDO'
  | 'PIN_NAO_DEFINIDO'
  | 'PIN_FRACO'
  | 'PIN_NAO_CONFERE'
  | 'PIN_JA_DEFINIDO'
  | 'MFA_OBRIGATORIO'
  | 'PLANTAO_INDISPONIVEL'
  | 'JANELA_NAO_ABERTA'
  | 'JANELA_ENCERRADA'
  | 'CRUZADA_BLOQUEADA'
  | 'EM_AUSENCIA'
  | 'LIMITE_ATINGIDO'
  | 'CICLO_INEXISTENTE'
  | 'MARCACAO_INEXISTENTE'
  // Aditivo (retomada API-ADM-MAR-*, mesmo padrão do comentário acima desta
  // union para as outras rodadas): `MENSAGENS_ERRO_FUNCAO` (abaixo, usado por
  // `erroDeExcecaoDeFuncao` para os RAISE EXCEPTION de `marcar_extra`/
  // `cancelar_extra`, FN-005/FN-006) já cobria estes três códigos, mas a
  // union não os declarava — `tsc --noEmit` falhava em
  // `MENSAGENS_ERRO_FUNCAO`/`erroDeExcecaoDeFuncao` (`Record<...codigo, string>`
  // não é atribuível a `CodigoErro`). Nenhum código removido/redefinido.
  | 'COLABORADOR_BLOQUEADO'
  | 'CONFLITO_DE_HORARIO'
  | 'SEM_VAGA'
  /** `POST /api/admin/administradores` — convite pra e-mail já cadastrado no Supabase Auth. Aditivo, mesmo padrão acima. */
  | 'EMAIL_JA_EXISTE'
  /** `DELETE /api/admin/administradores/:id` — admin não pode revogar a própria conta (evita autobloqueio). Aditivo, mesmo padrão acima. */
  | 'NAO_PODE_REVOGAR_A_SI_MESMO';

/** União completa de códigos que podem aparecer no campo `erro` da resposta (`CONVENTIONS.md`, "Envelope de resposta"). `SCREAMING_SNAKE`, sem acento. */
export type CodigoErro = CodigoErroInfra | CodigoErroNegocio | ErroApi;

/** Mapa campo → problema, preenchido só em erro de validação (`CONVENTIONS.md`). */
export type DetalhesValidacao = Record<string, string>;

/**
 * Único tipo de erro que um handler de rota deve lançar. Qualquer outro erro
 * lançado dentro de `handler` (erro do Prisma, bug, etc.) é convertido para
 * `ErroHttp` por `traduzirErro` antes de virar resposta — o handler de rota
 * nunca precisa montar `NextResponse` de erro à mão.
 */
export class ErroHttp extends Error {
  readonly status: number;
  readonly codigo: CodigoErro;
  /** Preenchido só em `422 VALIDACAO` — mapa campo → problema. `null` em qualquer outro erro (`CONVENTIONS.md`). */
  readonly detalhes: DetalhesValidacao | null;
  /** Segundos para o header `Retry-After`, exigido em `429`/`503` (`contrato-comum.md`, "Headers"). `undefined` fora desses status. */
  readonly retryAfterSegundos: number | undefined;
  /** Erro original capturado (para log interno — nunca serializado na resposta HTTP; pode conter detalhe técnico). */
  readonly causaOriginal?: unknown;

  constructor(opcoes: {
    status: number;
    codigo: CodigoErro;
    mensagem: string;
    detalhes?: DetalhesValidacao | null;
    retryAfterSegundos?: number | undefined;
    causaOriginal?: unknown;
  }) {
    super(opcoes.mensagem);
    this.name = 'ErroHttp';
    this.status = opcoes.status;
    this.codigo = opcoes.codigo;
    this.detalhes = opcoes.detalhes ?? null;
    this.retryAfterSegundos = opcoes.retryAfterSegundos;
    this.causaOriginal = opcoes.causaOriginal;
  }
}

/** `401` — sem sessão válida (`autenticação`, não `autorização`: a sessão simplesmente não existe/expirou/foi revogada). */
export function erroNaoAutenticado(mensagem = 'Sua sessão expirou. Faça login novamente.'): ErroHttp {
  return new ErroHttp({ status: 401, codigo: 'NAO_AUTENTICADO', mensagem });
}

/**
 * `403` — sessão válida, mas o ator não tem o papel/permissão exigido pela
 * rota (ex.: colaborador tentando uma rota `ator: 'ADMIN'`). **Nunca** usar
 * para "recurso de terceiro existe mas não é seu" — isso é
 * `erroNaoEncontrado` (`contrato-comum.md`: "Recurso de terceiro → 404,
 * nunca 403 — não vazamos existência").
 */
export function erroSemPermissao(mensagem = 'Você não tem permissão para esta ação.'): ErroHttp {
  return new ErroHttp({ status: 403, codigo: 'SEM_PERMISSAO', mensagem });
}

/**
 * `404` — recurso inexistente **ou** existente mas de outro ator (visto por
 * quem não deveria ver). As duas situações usam o mesmo código e a mesma
 * mensagem genérica — nunca "existe mas não é seu", que vazaria existência.
 * Todo handler que busca um recurso por id de path deve usar isto quando a
 * query não encontrar linha visível ao ator, nunca `erroSemPermissao`.
 */
export function erroNaoEncontrado(mensagem = 'Recurso não encontrado.'): ErroHttp {
  return new ErroHttp({ status: 404, codigo: 'RECURSO_NAO_ENCONTRADO', mensagem });
}

/**
 * `409` — regra de negócio recusou a operação (`CONVENTIONS.md`: "Regra de
 * negócio recusou → 409 Conflict"). Use um código específico do catálogo
 * (`ErroApi` de `db/erros.ts`, ex. `JA_MARCADO`) quando a recusa vier de uma
 * constraint/SQLSTATE traduzida; use `REGRA_DE_NEGOCIO` (ou outro código de
 * domínio definido pela spec da rota) quando a checagem for feita em TS
 * antes de chegar ao banco.
 */
export function erroDeNegocio(mensagem: string, codigo: CodigoErro = 'REGRA_DE_NEGOCIO'): ErroHttp {
  return new ErroHttp({ status: 409, codigo, mensagem });
}

/** `422` — payload não passou na validação Zod. `detalhes` é sempre preenchido aqui. */
export function erroDeValidacao(detalhes: DetalhesValidacao, mensagem = 'Dados inválidos.'): ErroHttp {
  return new ErroHttp({ status: 422, codigo: 'VALIDACAO', mensagem, detalhes });
}

/** `429` — rate limit estourado. `retryAfterSegundos` vira o header `Retry-After` (`contrato-comum.md`). */
export function erroLimiteExcedido(retryAfterSegundos: number, mensagem = 'Muitas tentativas. Tente novamente em instantes.'): ErroHttp {
  return new ErroHttp({ status: 429, codigo: 'LIMITE_EXCEDIDO', mensagem, retryAfterSegundos });
}

/** `403` — falha de CSRF (`X-Requested-With` ausente ou `Content-Type` proibido em mutação). Ver `./csrf.ts`. */
export function erroDeCsrf(motivo: 'HEADER_AUSENTE' | 'CONTENT_TYPE_PROIBIDO'): ErroHttp {
  const codigo: CodigoErro = motivo === 'CONTENT_TYPE_PROIBIDO' ? 'CONTENT_TYPE_INVALIDO' : 'CSRF_INVALIDO';
  return new ErroHttp({ status: 403, codigo, mensagem: 'Requisição recusada por segurança. Recarregue a página e tente novamente.' });
}

/**
 * `401` — matrícula inexistente **ou** PIN errado (`04-api/auth/API-AUTH-001`/`002`).
 * Resposta e mensagem idênticas nos dois casos — não vaza qual campo falhou
 * nem se a matrícula existe (`SEC-CONF`, "Enumeração").
 */
export function erroCredenciaisInvalidas(mensagem = 'Matrícula ou PIN inválidos.'): ErroHttp {
  return new ErroHttp({ status: 401, codigo: 'CREDENCIAIS_INVALIDAS', mensagem });
}

/** `423` — `colaborador.bloqueado_ate > now()` (`04-api/auth/API-AUTH-001`/`002`). Bloqueio é sempre temporário (`SEC-DISP`, D2). */
export function erroContaBloqueada(mensagem = 'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.'): ErroHttp {
  return new ErroHttp({ status: 423, codigo: 'CONTA_BLOQUEADA', mensagem });
}

/** `403` — `colaborador.ativo = false` (`04-api/auth/API-AUTH-001`). Não é `SEM_PERMISSAO` genérico: é um estado de conta, não de papel. */
export function erroColaboradorInativo(mensagem = 'Esta conta está inativa.'): ErroHttp {
  return new ErroHttp({ status: 403, codigo: 'COLABORADOR_INATIVO', mensagem });
}

/** `401` — `tokenParcial` ausente, malformado, expirado, de escopo errado ou já usado (`04-api/auth/API-AUTH-002`/`003`). */
export function erroTokenInvalido(mensagem = 'Sessão de login expirada. Comece o login novamente.'): ErroHttp {
  return new ErroHttp({ status: 401, codigo: 'TOKEN_INVALIDO', mensagem });
}

/** `409` — PIN da etapa 2 (`/pin`) chamado antes de o colaborador ter definido um PIN (`04-api/auth/API-AUTH-002`). */
export function erroPinNaoDefinido(mensagem = 'Você ainda não definiu um PIN. Defina um PIN para continuar.'): ErroHttp {
  return new ErroHttp({ status: 409, codigo: 'PIN_NAO_DEFINIDO', mensagem });
}

/** `422` — PIN reprovado em RN-30 (sequência, repetido, igual à matrícula, ou um dos 20 mais comuns). Nunca detalha qual regra (`04-api/auth/API-AUTH-003`). */
export function erroPinFraco(mensagem = 'Este PIN é fácil de adivinhar. Escolha outro.'): ErroHttp {
  return new ErroHttp({ status: 422, codigo: 'PIN_FRACO', mensagem });
}

/** `422` — `pin !== confirmacao` (`04-api/auth/API-AUTH-003`). */
export function erroPinNaoConfere(mensagem = 'PIN e confirmação não conferem.'): ErroHttp {
  return new ErroHttp({ status: 422, codigo: 'PIN_NAO_CONFERE', mensagem });
}

/** `409` — `definir-pin` chamado quando o colaborador já tem `pinHash` e não precisa trocar (`04-api/auth/API-AUTH-003`). */
export function erroPinJaDefinido(mensagem = 'PIN já definido para esta conta.'): ErroHttp {
  return new ErroHttp({ status: 409, codigo: 'PIN_JA_DEFINIDO', mensagem });
}

/** `403` — admin sem fator MFA cadastrado (`04-api/auth/API-AUTH-006`). Bloqueado até cadastrar — a conta de maior privilégio exige o segundo fator. */
export function erroMfaObrigatorio(mensagem = 'Cadastre um fator de autenticação de dois passos para continuar.'): ErroHttp {
  return new ErroHttp({ status: 403, codigo: 'MFA_OBRIGATORIO', mensagem });
}

/** `500` — erro não mapeado. Mensagem sempre genérica; o erro real vai só para `causaOriginal` (log interno, nunca resposta). */
export function erroInterno(causaOriginal: unknown): ErroHttp {
  return new ErroHttp({
    status: 500,
    codigo: 'ERRO_INTERNO',
    mensagem: 'Erro interno. Tente novamente em instantes.',
    causaOriginal,
  });
}

/**
 * Mensagem em português, sem detalhe técnico, para cada código de
 * `ErroApi` (a tabela de `db/erros.ts` só carrega `erro`/`http`, nunca
 * texto para o usuário — esse catálogo é o complemento de API).
 */
const MENSAGENS_ERRO_NEGOCIO: Record<ErroApi, string> = {
  JA_MARCADO: 'Este plantão já está marcado.',
  CONFLITO_DE_HORARIO: 'Você já tem um compromisso nesse horário.',
  ESCALA_SOBREPOSTA: 'Já existe escala cadastrada para esse período.',
  SEM_VAGA: 'Não há mais vaga disponível para este plantão.',
  REFERENCIA_INVALIDA: 'Referência inválida — verifique os dados enviados.',
  SISTEMA_OCUPADO: 'Sistema ocupado no momento. Tente novamente em instantes.',
};

/** `SISTEMA_OCUPADO` (lock timeout/deadlock, `55P03`/`40P01`) sempre pede retry rápido — 1s, igual ao já documentado em `db/erros.ts`/`tx.ts`. */
const RETRY_AFTER_SISTEMA_OCUPADO_SEGUNDOS = 1;

/**
 * Códigos levantados por `RAISE EXCEPTION '<código>'` dentro de
 * `marcar_extra`/`cancelar_extra` (ver doc-comment de `CodigoErroNegocio`
 * acima) — SQLSTATE genérico `P0001`, sem constraint associada, então nunca
 * aparecem em `MAPA_ERROS_POSTGRES` (`db/erros.ts`, que só cobre SQLSTATE de
 * *constraint*). `http` é `409` para todos, salvo `MARCACAO_INEXISTENTE`
 * (`404` — `API-ADM-MAR-003`/`API-COL-005`: recurso de terceiro/inexistente
 * nunca é `403`, `contrato-comum.md`). Mensagens em português, sem detalhe
 * técnico (`CONVENTIONS.md`).
 */
const MENSAGENS_ERRO_FUNCAO: Record<
  'PLANTAO_INDISPONIVEL' | 'JANELA_NAO_ABERTA' | 'JANELA_ENCERRADA' | 'COLABORADOR_INATIVO' | 'COLABORADOR_BLOQUEADO'
  | 'CRUZADA_BLOQUEADA' | 'EM_AUSENCIA' | 'CONFLITO_DE_HORARIO' | 'EXCEDE_JORNADA' | 'LIMITE_ATINGIDO' | 'SEM_VAGA'
  | 'CICLO_FECHADO' | 'CICLO_INEXISTENTE' | 'MARCACAO_INEXISTENTE',
  string
> = {
  PLANTAO_INDISPONIVEL: 'Este plantão não está mais disponível.',
  CICLO_FECHADO: 'Este ciclo está fechado para marcações.',
  JANELA_NAO_ABERTA: 'A janela de marcação ainda não abriu.',
  JANELA_ENCERRADA: 'A janela de marcação já encerrou.',
  COLABORADOR_INATIVO: 'Colaborador inativo.',
  COLABORADOR_BLOQUEADO: 'Colaborador bloqueado para marcação de extras.',
  CRUZADA_BLOQUEADA: 'Marcação entre RTs diferentes não é permitida aqui.',
  EM_AUSENCIA: 'Colaborador está em ausência nesse dia.',
  CONFLITO_DE_HORARIO: 'Você já tem um compromisso nesse horário.',
  EXCEDE_JORNADA: 'Isso excederia o limite de horas seguidas permitido.',
  LIMITE_ATINGIDO: 'Limite de extras do ciclo atingido.',
  SEM_VAGA: 'Não há mais vaga disponível para este plantão.',
  CICLO_INEXISTENTE: 'Ciclo não encontrado.',
  MARCACAO_INEXISTENTE: 'Marcação não encontrada.',
};

const HTTP_ERRO_FUNCAO: Partial<Record<keyof typeof MENSAGENS_ERRO_FUNCAO, number>> = {
  MARCACAO_INEXISTENTE: 404,
};

/** Extrai o texto bruto de mensagem de um erro do driver Postgres/Prisma (`meta.message` do erro `P2010` de raw query, com fallback para `.message`). Nunca lê SQLSTATE — só o texto, que é o próprio código de negócio nestes dois casos. */
function mensagemBrutaPostgres(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const meta = (erro as { meta?: { message?: unknown } }).meta;
  if (meta && typeof meta.message === 'string') return meta.message;
  const mensagem = (erro as { message?: unknown }).message;
  return typeof mensagem === 'string' ? mensagem : undefined;
}

/**
 * Tenta reconhecer um `RAISE EXCEPTION '<código>'` de `marcar_extra`/
 * `cancelar_extra` dentro de um erro capturado. Retorna `undefined` quando
 * não reconhece — o chamador (`traduzirErro`) cai então em `erroInterno`,
 * nunca inventa um código de negócio a partir de texto não catalogado.
 */
function erroDeExcecaoDeFuncao(erro: unknown): ErroHttp | undefined {
  const mensagem = mensagemBrutaPostgres(erro);
  if (!mensagem) return undefined;

  for (const codigo of Object.keys(MENSAGENS_ERRO_FUNCAO) as Array<keyof typeof MENSAGENS_ERRO_FUNCAO>) {
    if (new RegExp(`\\b${codigo}\\b`).test(mensagem)) {
      return new ErroHttp({
        status: HTTP_ERRO_FUNCAO[codigo] ?? 409,
        codigo,
        mensagem: MENSAGENS_ERRO_FUNCAO[codigo],
        causaOriginal: erro,
      });
    }
  }
  return undefined;
}

/**
 * Converte um erro do Zod em `detalhes` (`DetalhesValidacao`): mapa
 * `caminho.do.campo → mensagem`. Quando mais de um problema cai no mesmo
 * caminho, as mensagens são concatenadas com `; ` (nunca sobrescritas
 * silenciosamente — quem lê `detalhes` vê todos os problemas daquele campo).
 */
export function detalhesDeZodError(erro: ZodError): DetalhesValidacao {
  const detalhes: DetalhesValidacao = {};
  for (const issue of erro.issues) {
    const caminho = issue.path.length > 0 ? issue.path.join('.') : '_';
    detalhes[caminho] = detalhes[caminho] ? `${detalhes[caminho]}; ${issue.message}` : issue.message;
  }
  return detalhes;
}

/**
 * Tradução de erro central do pipeline (passo "tradução de erro" de
 * `defineHandler`). Recebe qualquer coisa capturada por um `try/catch` em
 * volta do handler de rota e devolve sempre um `ErroHttp` — nunca deixa um
 * erro "cru" vazar para a serialização da resposta.
 *
 * Ordem de tentativa:
 * 1. Já é `ErroHttp` (o handler levantou de propósito) → repassa.
 * 2. `ZodError` (validação fora do passo dedicado, ex. dentro do handler) → `422`.
 * 3. SQLSTATE conhecido, via `erroApiParaPostgres` (`db/erros.ts`, único
 *    lugar que lê `meta.code`/`code` do driver — este módulo nunca lê
 *    SQLSTATE diretamente) → status e código da tabela de `constraints.md`,
 *    mensagem do catálogo acima.
 * 4. Qualquer outro valor → `500 ERRO_INTERNO`, mensagem genérica, erro
 *    original preservado só em `causaOriginal` para o log estruturado.
 */
export function traduzirErro(erro: unknown): ErroHttp {
  if (erro instanceof ErroHttp) return erro;

  if (erro instanceof ZodError) {
    return erroDeValidacao(detalhesDeZodError(erro));
  }

  const mapeamentoPostgres = erroApiParaPostgres(erro);
  if (mapeamentoPostgres) {
    return new ErroHttp({
      status: mapeamentoPostgres.http,
      codigo: mapeamentoPostgres.erro,
      mensagem: MENSAGENS_ERRO_NEGOCIO[mapeamentoPostgres.erro],
      retryAfterSegundos: mapeamentoPostgres.erro === 'SISTEMA_OCUPADO' ? RETRY_AFTER_SISTEMA_OCUPADO_SEGUNDOS : undefined,
      causaOriginal: erro,
    });
  }

  // 3.5. `RAISE EXCEPTION '<código>'` de marcar_extra/cancelar_extra (FN-005/
  // FN-006) — sem SQLSTATE/constraint próprio, então nunca cai no passo
  // acima. Ver doc-comment de `CodigoErroNegocio` e `_conflitos.md` item 12.
  const erroDeFuncao = erroDeExcecaoDeFuncao(erro);
  if (erroDeFuncao) return erroDeFuncao;

  return erroInterno(erro);
}

/** Corpo de resposta de erro — formato fixado por `CONVENTIONS.md`, "Envelope de resposta". */
export interface RespostaErro {
  erro: CodigoErro;
  mensagem: string;
  detalhes: DetalhesValidacao | null;
  requestId: string;
}

/** Monta o envelope de erro (`CONVENTIONS.md`) a partir de um `ErroHttp` já traduzido. */
export function formatarRespostaErro(erro: ErroHttp, requestId: string): RespostaErro {
  return {
    erro: erro.codigo,
    mensagem: erro.message,
    detalhes: erro.detalhes,
    requestId,
  };
}
