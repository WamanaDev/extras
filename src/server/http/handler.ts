/**
 * API-000 — `defineHandler`: o wrapper obrigatório de toda rota.
 *
 * Entregável de `specs/04-api/contrato-comum.md`. Todas as specs de
 * `04-api/*` herdam deste contrato — não repita aqui o que já está descrito
 * lá; este arquivo só implementa o pipeline:
 *
 * ```
 * requestId → rate limit → autenticação → autorização → validação Zod
 * → handler → serialização → tradução de erro → log estruturado
 * ```
 *
 * mais os headers/cache/paginação/CSRF exigidos pela mesma spec. Reaproveita
 * o que a Onda 0/1 já entregou em vez de duplicar:
 * - `./csrf.ts` (SEC-INT) para o requisito `X-Requested-With: fetch`.
 * - `./rate-limit.ts` (SEC-DISP) para os limitadores já tabelados.
 * - `./security-headers.ts` já é aplicado globalmente em `src/middleware.ts` —
 *   não repetido aqui.
 * - `../log/redact.ts` (SEC-CONF) para o log estruturado nunca vazar dado
 *   pessoal.
 * - `./erros.ts` para tradução/formatação de erro (que por sua vez reaproveita
 *   `../db/erros.ts` para SQLSTATE — handler nunca lê SQLSTATE).
 *
 * ## Por que `criarDefineHandler` (fábrica) em vez de só exportar `defineHandler`
 *
 * Duas peças do contrato exigem determinismo em teste:
 * - `ctx.agora` "é injetado, não `new Date()` dentro do handler" — mas
 *   *alguém* ainda precisa produzir esse valor uma vez por requisição. Esse
 *   alguém é o pipeline, via a dependência `relogio` (default `() =>
 *   new Date()`, substituível em teste por um relógio fixo).
 * - Autenticação/rate limit/log tocam sessão de banco, Redis e `console` —
 *   nenhum dos quais o teste de pipeline (ver `handler.test.ts`) deve tocar
 *   de verdade. `criarDefineHandler(dependencias)` permite injetar fakes
 *   para as quatro dependências sem exercitar I/O real.
 *
 * `defineHandler` exportado é só `criarDefineHandler()` com as dependências
 * padrão — é o que toda rota real usa.
 */
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z, ZodError, type ZodSchema } from 'zod';
import { verificarCsrf, METODOS_MUTACAO } from './csrf';
import { verificarRateLimit, type EscopoRateLimit, type DecisaoRateLimit } from './rate-limit';
import { redigirParaLog } from '@/server/log/redact';
import {
  ErroHttp,
  erroNaoAutenticado,
  erroSemPermissao,
  erroDeValidacao,
  erroDeCsrf,
  erroLimiteExcedido,
  traduzirErro,
  formatarRespostaErro,
  detalhesDeZodError,
} from './erros';

// ----------------------------------------------------------------------------
// Contexto e ator (contrato-comum.md, "Contexto" e "Ator")
// ----------------------------------------------------------------------------

/** `ctx` entregue a todo handler — nunca `new Date()` dentro dele (`contrato-comum.md`, "Contexto"). */
export interface ContextoRequisicao {
  requestId: string;
  /** De `x-forwarded-for`, proxy da Vercel como fonte confiável — nunca header arbitrário do cliente. */
  ip: string;
  userAgent: string;
  /** Injetado pelo pipeline — determinístico em teste. */
  agora: Date;
  /** `Idempotency-Key` do header, quando presente (ex.: `POST /api/marcacoes`). A dedupe em si é responsabilidade da rota/constraint de banco, não deste wrapper. */
  idempotencyKey: string | null;
}

export type TipoAtorRota = 'PUBLICO' | 'COLABORADOR' | 'ADMIN' | 'QUALQUER';

export interface AtorColaborador {
  tipo: 'COLABORADOR';
  colaboradorId: string;
  sessaoId: string;
}

export interface AtorAdmin {
  tipo: 'ADMIN';
  adminId: string;
  email: string | null;
  /**
   * `user_metadata.nome` (ou `full_name`) do Supabase Auth — `API-AUTH-005-me.md`
   * exige `{ tipo: 'ADMIN', admin: { id, email, nome } }`. Extensão aditiva do
   * tipo (`_conflitos.md`): nenhum consumidor existente lia este campo antes,
   * então adicioná-lo não quebra nada já escrito.
   */
  nome?: string | null;
}

/** Sessão resolvida pela autenticação. `null` só é um resultado válido quando a rota declara `ator: 'PUBLICO'`. */
export type SessaoResolvida = AtorColaborador | AtorAdmin;

/**
 * Resolve a sessão a partir da requisição. O ator vem **sempre** da sessão —
 * nenhuma rota aceita id de colaborador vindo do corpo para operação sobre
 * si mesmo (`contrato-comum.md`, "Ator"; `SEC-INT`, T2). Rota de admin sobre
 * terceiro recebe o id do terceiro pelo path — o ator da sessão continua
 * sendo o admin, nunca o id do path.
 *
 * A implementação padrão (`resolverSessaoPadrao`, abaixo) é o ponto de
 * integração com as specs de `04-api/auth/*` (login, PIN, admin-login) —
 * este módulo não antecipa rota concreta nenhuma, só o contrato de forma.
 * Toda spec/teste que não quiser tocar sessão real injeta seu próprio
 * `resolverSessao` via `criarDefineHandler`.
 */
export type ResolverSessao = (request: NextRequest, ip: string, atorEsperado: TipoAtorRota) => Promise<SessaoResolvida | null>;

/**
 * Implementação padrão — assume um cookie `sessao_colaborador` (nome
 * derivado da tabela `sessao_colaborador`; `04-api/auth/*` é quem define o
 * nome definitivo do cookie ao implementar login/logout — ajustar aqui se
 * divergir) contendo o token em claro, cujo SHA-256 é comparado a
 * `sessao_colaborador.token_hash` (reaproveita `hashDoToken` de
 * `../auth/credenciais.ts` — nunca reimplementa o hashing). Sessão de admin
 * é resolvida via Supabase Auth (`stack.md`, D "Auth admin").
 *
 * Carrega o Prisma Client sob demanda (`import()` dinâmico) para que
 * nenhuma rota de teste que injete seu próprio `resolverSessao` precise de
 * `DATABASE_URL`/cliente gerado disponível no processo.
 */
async function resolverSessaoColaborador(tokenCookie: string): Promise<AtorColaborador | null> {
  const { PrismaClient } = await import('@prisma/client');
  const { hashDoToken } = await import('@/server/auth/credenciais');
  const prisma = obterPrismaSingleton(PrismaClient);

  const tokenHash = hashDoToken(tokenCookie);
  const sessao = await prisma.sessaoColaborador.findFirst({ where: { tokenHash } });
  if (!sessao) return null;
  if (sessao.revogadaEm !== null) return null;
  if (sessao.expiraEm.getTime() <= Date.now()) return null;

  return { tipo: 'COLABORADOR', colaboradorId: sessao.colaboradorId, sessaoId: sessao.id };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tipo do PrismaClient importado dinamicamente; `any` isolado neste único ponto de bootstrap, nunca propaga.
let prismaSingleton: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function obterPrismaSingleton(PrismaClientCtor: new () => any): any {
  prismaSingleton ??= new PrismaClientCtor();
  return prismaSingleton;
}

/**
 * Sessão de admin via Supabase Auth (`stack.md`, "Auth admin: Supabase Auth
 * + MFA"). Lê o cookie de sessão gerenciado por `@supabase/ssr` — o adapter
 * de cookies aqui é só leitura (rota de API não decide refresh de token de
 * admin; isso é `04-api/auth/API-AUTH-006-admin-login.md`).
 */
async function resolverSessaoAdmin(request: NextRequest): Promise<AtorAdmin | null> {
  const { createServerClient } = await import('@supabase/ssr');
  const { env } = await import('@/env');

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
      // Rota de leitura de sessão não escreve cookie de volta — refresh é responsabilidade de quem faz login.
      setAll: () => {},
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const metadata = data.user.user_metadata as Record<string, unknown> | undefined;
  const nome = typeof metadata?.nome === 'string' ? metadata.nome : typeof metadata?.full_name === 'string' ? (metadata.full_name as string) : null;
  return { tipo: 'ADMIN', adminId: data.user.id, email: data.user.email ?? null, nome };
}

/**
 * Resolvedor padrão: tenta colaborador (cookie próprio) e admin (Supabase).
 *
 * A ORDEM importa quando as duas sessões existem ao mesmo tempo no mesmo
 * navegador (comum em teste manual — alguém loga como colaborador numa aba
 * e como admin noutra, ambos os cookies ficam válidos no mesmo domínio).
 * Sem `atorEsperado`, o resolvedor sempre testava colaborador primeiro,
 * incondicionalmente: uma rota `ator: 'ADMIN'` com um cookie de colaborador
 * válido no navegador recebia de volta a sessão de COLABORADOR e nunca
 * chegava a checar o cookie de admin (Supabase) — derrubando toda rota
 * admin com `403 SEM_PERMISSAO` mesmo com login de admin correto e válido
 * (achado em uso real, `_conflitos.md`). Agora tenta primeiro o tipo que a
 * rota exige — só cai pro outro tipo quando a rota aceita `'QUALQUER'` sessão.
 */
export async function resolverSessaoPadrao(request: NextRequest, _ip: string, atorEsperado: TipoAtorRota): Promise<SessaoResolvida | null> {
  async function tentarColaborador(): Promise<SessaoResolvida | null> {
    const tokenColaborador = request.cookies.get('sessao_colaborador')?.value;
    return tokenColaborador ? resolverSessaoColaborador(tokenColaborador) : null;
  }

  if (atorEsperado === 'ADMIN') {
    return (await resolverSessaoAdmin(request)) ?? (await tentarColaborador());
  }
  if (atorEsperado === 'COLABORADOR') {
    return (await tentarColaborador()) ?? resolverSessaoAdmin(request);
  }
  // 'QUALQUER'/'PUBLICO': ordem histórica, colaborador primeiro.
  return (await tentarColaborador()) ?? resolverSessaoAdmin(request);
}

// ----------------------------------------------------------------------------
// Cache (contrato-comum.md, tabela "Cache")
// ----------------------------------------------------------------------------

export type TipoCache = 'mutacao' | 'pessoal' | 'grade-extras' | 'referencia';

const CACHE_CONTROL: Record<TipoCache, string> = {
  mutacao: 'no-store',
  pessoal: 'private, no-store',
  'grade-extras': 'private, max-age=5',
  referencia: 'private, max-age=300',
};

// ----------------------------------------------------------------------------
// Paginação (contrato-comum.md, "Paginação")
// ----------------------------------------------------------------------------

export const TAMANHO_PAGINA_PADRAO = 50;
export const TAMANHO_PAGINA_TETO = 200;

/** Schema pronto para toda rota de listagem paginada mesclar ao próprio `query` (`?pagina=1&tamanho=50`, teto 200). */
export const paginacaoQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanho: z.coerce.number().int().min(1).max(TAMANHO_PAGINA_TETO).default(TAMANHO_PAGINA_PADRAO),
});

export type PaginacaoQuery = z.infer<typeof paginacaoQuerySchema>;

/** Formato de retorno esperado do `handler` de uma rota `paginacao: true` — o wrapper serializa `itens` como o corpo (sem envelope, `CONVENTIONS.md`) e expõe `total` via `X-Total-Count`. */
export interface RespostaPaginada<T> {
  itens: T[];
  total: number;
}

function ehRespostaPaginada(valor: unknown): valor is RespostaPaginada<unknown> {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    Array.isArray((valor as RespostaPaginada<unknown>).itens) &&
    typeof (valor as RespostaPaginada<unknown>).total === 'number'
  );
}

// ----------------------------------------------------------------------------
// Log estruturado (CONVENTIONS.md, "Logs")
// ----------------------------------------------------------------------------

export interface LinhaLog {
  requestId: string;
  atorTipo: 'COLABORADOR' | 'ADMIN' | 'PUBLICO';
  atorId: string | null;
  rota: string;
  metodo: string;
  duracaoMs: number;
  status: number;
}

/** `console.log` de uma linha já redigida (`../log/redact.ts`) — nunca loga o objeto cru. */
function registrarLogPadrao(linha: LinhaLog): void {
  // eslint-disable-next-line no-console
  console.log(redigirParaLog(linha));
}

// ----------------------------------------------------------------------------
// Config de `defineHandler`
// ----------------------------------------------------------------------------

export interface EntradaHandler<TAtor extends TipoAtorRota, TBody, TQuery, TParams> {
  ator: SessaoParaAtor<TAtor>;
  body: TBody;
  query: TQuery;
  params: TParams;
  ctx: ContextoRequisicao;
  request: NextRequest;
}

/** `ator` tipado por config: `PUBLICO` → `null`; `COLABORADOR`/`ADMIN` → o tipo específico; `QUALQUER` → união. */
export type SessaoParaAtor<TAtor extends TipoAtorRota> = TAtor extends 'PUBLICO'
  ? null
  : TAtor extends 'COLABORADOR'
    ? AtorColaborador
    : TAtor extends 'ADMIN'
      ? AtorAdmin
      : SessaoResolvida;

export interface ConfigRateLimit {
  escopo: EscopoRateLimit;
  /**
   * Identificador do balde além do padrão (IP). O pipeline fixo
   * (`requestId → rate limit → autenticação → ...`) roda rate limit
   * **antes** de resolver a sessão — por isso este callback não recebe um
   * ator resolvido, só a requisição crua. Para escopos `_por_sessao`
   * (`marcacoes_por_sessao`, `leitura_por_sessao`), use o valor cru do
   * cookie de sessão (`request.cookies.get('sessao_colaborador')?.value`)
   * como chave — identifica o balde sem precisar validar a sessão ainda.
   */
  identificador?: (info: { ip: string; request: NextRequest }) => string;
}

export interface ConfigHandler<
  TAtor extends TipoAtorRota,
  TBody = undefined,
  TQuery = undefined,
  TParams = undefined,
> {
  ator: TAtor;
  rateLimit?: ConfigRateLimit;
  body?: ZodSchema<TBody>;
  query?: ZodSchema<TQuery>;
  params?: ZodSchema<TParams>;
  /** Checagem de autorização adicional, além do tipo de ator (ex.: admin só pode agir sobre ciclo não `FECHADO`). Lançar `ErroHttp` (`erroSemPermissao`/`erroNaoEncontrado`) para recusar. */
  autorizar?: (info: { ator: SessaoParaAtor<TAtor>; params: TParams; ctx: ContextoRequisicao }) => void | Promise<void>;
  /** Política de cache da resposta de sucesso (`contrato-comum.md`, tabela "Cache"). Obrigatório em rota de leitura (`GET`) — mutação usa `'mutacao'` por padrão se omitido. */
  cache?: TipoCache;
  /** Ativa o schema de paginação (`?pagina=&tamanho=`) e a serialização `{ itens, total } → corpo + X-Total-Count`. */
  paginacao?: boolean;
  /**
   * Status HTTP de sucesso quando o corpo não é `undefined` e `paginacao`
   * não está ativa. Default `200`. Aditivo (ver `_conflitos.md`, item 12):
   * `contrato-comum.md` nunca fixou como uma rota de criação sinaliza `201`
   * — várias specs de `04-api/*` (ex. `API-ADM-CIC-002`, `API-ADM-CIC-007`)
   * exigem `201` no teste de aceitação. Omitir mantém o comportamento
   * anterior (`200`) em toda rota já escrita.
   */
  statusSucesso?: number;
  /** Permite `Content-Type: multipart/form-data` em mutação (default `false`) — ver docstring de `verificarCsrf`. Só para rotas de upload de arquivo (ex.: `POST /api/admin/colaboradores/importar`). */
  permitirMultipart?: boolean;
  handler: (entrada: EntradaHandler<TAtor, TBody, TQuery, TParams>) => Promise<unknown>;
}

export type RotaHandler = (
  request: NextRequest,
  // Não-opcional: o checador de tipos de rota do Next.js 15 (`.next/types/`)
  // valida que o `GET`/`POST` exportado é atribuível a um `RouteContext`
  // específico por rota, e um segundo parâmetro opcional (`contexto?:`)
  // torna o parâmetro inteiro `T | undefined`, que não satisfaz esse tipo
  // gerado mesmo em rotas sem segmento dinâmico. `params` continua opcional
  // dentro do objeto — só o objeto em si deixou de ser opcional.
  // `params` é sempre `Promise<...>` e obrigatório — o checador de tipos
  // gerado pelo Next.js 15 em `.next/types/` exige exatamente essa forma em
  // TODA rota (com ou sem segmento dinâmico); rota sem parâmetro de path
  // recebe `Promise<Record<string, never>>` em runtime. `parseParams`
  // resolve a promise e valida contra o schema Zod da rota (que é opcional
  // — rotas sem `[param]` simplesmente não declaram `params` no config).
  contexto: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

// ----------------------------------------------------------------------------
// Dependências injetáveis (para teste do pipeline sem I/O real)
// ----------------------------------------------------------------------------

export interface DependenciasHandler {
  relogio: () => Date;
  resolverSessao: ResolverSessao;
  verificarLimite: (escopo: EscopoRateLimit, identificador: string) => Promise<DecisaoRateLimit>;
  registrarLog: (linha: LinhaLog) => void;
  gerarRequestId: () => string;
}

const dependenciasPadrao: DependenciasHandler = {
  relogio: () => new Date(),
  resolverSessao: resolverSessaoPadrao,
  verificarLimite: verificarRateLimit,
  registrarLog: registrarLogPadrao,
  gerarRequestId: () => randomUUID(),
};

// ----------------------------------------------------------------------------
// Helpers de extração de requisição
// ----------------------------------------------------------------------------

/** `ip` de `x-forwarded-for` (proxy da Vercel) — primeiro endereço da lista é o cliente. Nunca lê outro header (`contrato-comum.md`, "Contexto"). */
function extrairIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (!xff) return 'desconhecido';
  return xff.split(',')[0]?.trim() || 'desconhecido';
}

function nomeRota(request: NextRequest): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

function atorTipoParaLog(sessao: SessaoResolvida | null): LinhaLog['atorTipo'] {
  if (sessao === null) return 'PUBLICO';
  return sessao.tipo;
}

function atorIdParaLog(sessao: SessaoResolvida | null): string | null {
  if (sessao === null) return null;
  return sessao.tipo === 'COLABORADOR' ? sessao.colaboradorId : sessao.adminId;
}

// ----------------------------------------------------------------------------
// `criarDefineHandler` — fábrica com dependências injetáveis
// ----------------------------------------------------------------------------

export function criarDefineHandler(dependenciasParciais: Partial<DependenciasHandler> = {}) {
  const deps: DependenciasHandler = { ...dependenciasPadrao, ...dependenciasParciais };

  return function defineHandler<
    TAtor extends TipoAtorRota,
    TBody = undefined,
    TQuery = undefined,
    TParams = undefined,
  >(config: ConfigHandler<TAtor, TBody, TQuery, TParams>): RotaHandler {
    return async (request, contexto) => {
      const inicio = Date.now();

      // --- 1. requestId ---------------------------------------------------
      const requestId = deps.gerarRequestId();
      const ip = extrairIp(request.headers);
      const userAgent = request.headers.get('user-agent') ?? '';
      const agora = deps.relogio();
      const idempotencyKey = request.headers.get('idempotency-key');
      const ctx: ContextoRequisicao = { requestId, ip, userAgent, agora, idempotencyKey };

      let status = 500;
      let sessaoParaLog: SessaoResolvida | null = null;

      try {
        // --- CSRF (mutação) — X-Requested-With obrigatório, SEC-INT -------
        if (METODOS_MUTACAO.has(request.method)) {
          const resultadoCsrf = verificarCsrf(
            request.headers,
            config.permitirMultipart !== undefined ? { permitirMultipart: config.permitirMultipart } : {},
          );
          if (!resultadoCsrf.ok) {
            throw erroDeCsrf(resultadoCsrf.motivo);
          }
        }

        // --- 2. rate limit ----------------------------------------------
        // Roda antes da autenticação (contém abuso de credencial/avalanche
        // mesmo sem sessão válida — SEC-DISP). Escopos `_por_sessao` que
        // dependem do ator resolvido devem fornecer `identificador`
        // calculado após a resolução — a config aceita isso via a mesma
        // função, chamada de novo abaixo se necessário.
        let decisaoLimite: DecisaoRateLimit | null = null;
        if (config.rateLimit) {
          const identificador = config.rateLimit.identificador
            ? config.rateLimit.identificador({ ip, request })
            : ip;
          decisaoLimite = await deps.verificarLimite(config.rateLimit.escopo, identificador);
          if (!decisaoLimite.permitido) {
            throw erroLimiteExcedido(decisaoLimite.retryAfter);
          }
        }

        // --- 3. autenticação ----------------------------------------------
        let sessao: SessaoResolvida | null = null;
        if (config.ator !== 'PUBLICO') {
          sessao = await deps.resolverSessao(request, ip, config.ator);
          if (!sessao) {
            throw erroNaoAutenticado();
          }
        }
        sessaoParaLog = sessao;

        // --- 4. autorização -------------------------------------------------
        if (config.ator === 'COLABORADOR' && sessao?.tipo !== 'COLABORADOR') {
          throw erroSemPermissao();
        }
        if (config.ator === 'ADMIN' && sessao?.tipo !== 'ADMIN') {
          throw erroSemPermissao();
        }
        // 'QUALQUER' aceita qualquer sessão não nula; 'PUBLICO' não checa tipo.

        // --- 5. validação Zod ------------------------------------------------
        const body = await parseBody(request, config.body);
        const query = parseQuery(request, config.query, config.paginacao);
        const params = await parseParams(contexto, config.params);

        if (config.autorizar) {
          await config.autorizar({ ator: sessao as SessaoParaAtor<TAtor>, params, ctx });
        }

        // --- 6. handler -------------------------------------------------------
        const resultado = await config.handler({
          ator: sessao as SessaoParaAtor<TAtor>,
          body,
          query,
          params,
          ctx,
          request,
        });

        // --- 7. serialização --------------------------------------------------
        const cacheControl = resolverCacheControl(config, request.method);
        let response: NextResponse;
        if (resultado instanceof NextResponse) {
          // Passagem direta (aditivo — ver `_conflitos.md`, item sobre resposta
          // binária): `contrato-comum.md` nunca previu um handler que precisa
          // controlar `Content-Type`/`Content-Disposition` própria (arquivo
          // binário de exportação, `API-ADM-REL-002`) nem um corpo de sucesso
          // que não seja `{itens,total}`/objeto solto (`{ eventos }` com
          // `X-Total-Count` sem virar array solto, `API-ADM-REL-003`). Sem
          // este ramo, `NextResponse.json(resultado)` abaixo serializaria a
          // própria instância de `NextResponse` (que não tem propriedades
          // enumeráveis) como corpo — sempre errado. Os headers definidos a
          // seguir (`Cache-Control`, `X-Request-Id`, rate limit) continuam
          // aplicados por cima do que o handler já setou (`Content-Type`,
          // `Content-Disposition`), sem substituir o objeto `Headers` inteiro.
          response = resultado;
        } else if (config.paginacao && ehRespostaPaginada(resultado)) {
          response = NextResponse.json(resultado.itens, { status: 200 });
          response.headers.set('X-Total-Count', String(resultado.total));
        } else if (resultado === undefined) {
          response = new NextResponse(null, { status: 204 });
        } else {
          response = NextResponse.json(resultado, { status: config.statusSucesso ?? 200 });
        }
        response.headers.set('Cache-Control', cacheControl);
        response.headers.set('X-Request-Id', requestId);
        if (decisaoLimite) {
          response.headers.set('X-RateLimit-Limit', String(decisaoLimite.limite));
          response.headers.set('X-RateLimit-Remaining', String(decisaoLimite.restante));
        }

        status = response.status;
        return response;
      } catch (erroCapturado) {
        // --- 8. tradução de erro ----------------------------------------------
        const erroHttp = traduzirErro(erroCapturado);
        status = erroHttp.status;

        // `ERRO_INTERNO` é o único código que não veio de uma tradução
        // conhecida (regra de negócio, Zod, SQLSTATE, `RAISE EXCEPTION` de
        // função) — sem isso, um 500 real não deixava rastro nenhum: o log
        // estruturado (`LinhaLog`, abaixo) só carrega status/duração, nunca a
        // exceção original, e a resposta ao cliente nunca leva stack (por
        // design, `erros.ts`). Achado em uso real (`_conflitos.md`): um 500
        // em `escala/lote` era impossível de diagnosticar sem isto. Só stdout
        // do servidor — nunca no `LinhaLog` nem na resposta, então PII de
        // exceção não vaza pra lugar persistido/exposto.
        if (erroHttp.codigo === 'ERRO_INTERNO') {
          // eslint-disable-next-line no-console
          console.error(`[${requestId}] ERRO_INTERNO em ${nomeRota(request)}:`, erroCapturado);
        }

        const corpo = formatarRespostaErro(erroHttp, requestId);
        const response = NextResponse.json(corpo, { status: erroHttp.status });
        response.headers.set('X-Request-Id', requestId);
        response.headers.set('Cache-Control', 'no-store');
        if (erroHttp.retryAfterSegundos !== undefined) {
          response.headers.set('Retry-After', String(erroHttp.retryAfterSegundos));
        }
        return response;
      } finally {
        // --- 9. log estruturado -------------------------------------------
        deps.registrarLog({
          requestId,
          atorTipo: atorTipoParaLog(sessaoParaLog),
          atorId: atorIdParaLog(sessaoParaLog),
          rota: nomeRota(request),
          metodo: request.method,
          duracaoMs: Date.now() - inicio,
          status,
        });
      }
    };
  };
}

function resolverCacheControl<TAtor extends TipoAtorRota, TBody, TQuery, TParams>(
  config: ConfigHandler<TAtor, TBody, TQuery, TParams>,
  metodo: string,
): string {
  if (config.cache) return CACHE_CONTROL[config.cache];
  if (METODOS_MUTACAO.has(metodo)) return CACHE_CONTROL.mutacao;
  // Rota de leitura sem `cache` explícito: falha aberta para o mais restritivo
  // (nunca cachear por engano dado pessoal em resposta não classificada).
  return CACHE_CONTROL.pessoal;
}

async function parseBody<TBody>(request: NextRequest, schema: ZodSchema<TBody> | undefined): Promise<TBody> {
  if (!schema) return undefined as TBody;
  const metodosComCorpo = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  let bruto: unknown = undefined;
  if (metodosComCorpo.has(request.method)) {
    const texto = await request.text();
    if (texto.length > 0) {
      try {
        bruto = JSON.parse(texto);
      } catch {
        throw erroDeValidacao({ _: 'Corpo da requisição não é um JSON válido.' });
      }
    }
  }
  const resultado = schema.safeParse(bruto);
  if (!resultado.success) {
    throw erroDeValidacao(detalhesDeZodError(resultado.error));
  }
  return resultado.data;
}

function parseQuery<TQuery>(
  request: NextRequest,
  schema: ZodSchema<TQuery> | undefined,
  paginacao: boolean | undefined,
): TQuery {
  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const schemaEfetivo = paginacao
    ? (schema ? mesclarComPaginacao(schema) : (paginacaoQuerySchema as unknown as ZodSchema<TQuery>))
    : schema;
  if (!schemaEfetivo) return undefined as TQuery;

  const resultado = schemaEfetivo.safeParse(searchParams);
  if (!resultado.success) {
    if (resultado.error instanceof ZodError) {
      throw erroDeValidacao(detalhesDeZodError(resultado.error));
    }
    throw resultado.error;
  }
  return resultado.data;
}

function mesclarComPaginacao<TQuery>(schema: ZodSchema<TQuery>): ZodSchema<TQuery> {
  // `z.object` é o caso comum; schemas não-objeto não suportam merge — a
  // rota deve then compor a paginação manualmente no próprio schema.
  const comoObjeto = schema as unknown as { merge?: (outro: typeof paginacaoQuerySchema) => ZodSchema<TQuery> };
  if (typeof comoObjeto.merge === 'function') {
    return comoObjeto.merge(paginacaoQuerySchema);
  }
  return schema;
}

async function parseParams<TParams>(
  contexto: { params?: Promise<Record<string, string>> | Record<string, string> } | undefined,
  schema: ZodSchema<TParams> | undefined,
): Promise<TParams> {
  if (!schema) return undefined as TParams;
  const bruto = contexto?.params ? await Promise.resolve(contexto.params) : {};
  const resultado = schema.safeParse(bruto);
  if (!resultado.success) {
    throw erroDeValidacao(detalhesDeZodError(resultado.error));
  }
  return resultado.data;
}

/** `defineHandler` para uso real (todas as dependências reais — sessão via banco/Supabase, rate limit via Redis, log via `console`). */
export const defineHandler = criarDefineHandler();
