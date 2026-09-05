/**
 * SEC-DISP — Rate limit.
 *
 * Duas finalidades: conter abuso de credencial (login) e conter avalanche
 * legítima (abertura da janela de marcação). Implementação: Upstash Redis,
 * janela deslizante (`@upstash/ratelimit`).
 *
 * Assimetria deliberada quando o Redis cai:
 * - **Login falha fechado** (`falharAberto: false`) — segurança vence.
 * - **Leituras falham aberto** (`falharAberto: true`) — disponibilidade vence.
 *
 * `disponibilidade.md` não lista um arquivo de entregável explícito no
 * cabeçalho, mas a tabela de limites é o único conteúdo diretamente
 * codificável da spec, e o projeto já trazia `@upstash/ratelimit` e
 * `@upstash/redis` como dependências pré-instaladas — sinal de que este
 * módulo era o entregável pretendido. Implementado com escopo estrito à
 * tabela "Rate limit" da spec, nada além dela.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/env';

export interface DecisaoRateLimit {
  permitido: boolean;
  limite: number;
  restante: number;
  /** Segundos até a janela liberar de novo — vira o header `Retry-After`. */
  retryAfter: number;
}

/** Nomes dos limitadores — tabela "Rate limit" de `specs/02-seguranca/disponibilidade.md`. */
export type EscopoRateLimit =
  | 'login_matricula' // 5 falhas / 15 min → bloqueadoAte = now() + 15min (tratado fora daqui)
  | 'login_matricula_acumulado' // 10 falhas / 24h → bloqueio até liberação manual
  | 'login_ip' // 20 tentativas / 15 min
  | 'login_ip_acumulado' // 100 / 24h
  /**
   * `API-AUTH-006-admin-login.md`: "rate limit próprio (5/15min por e-mail,
   * 20/15min por IP)... independente do fluxo de colaborador — travar um não
   * trava o outro". A tabela de `02-seguranca/disponibilidade.md` não lista
   * escopo de admin — extensão aditiva (mesmo padrão de `login_matricula`/
   * `login_ip`, prefixo/balde próprios, nunca compartilha chave com o fluxo
   * de colaborador). Ver `_conflitos.md`.
   */
  | 'login_admin_email' // 5 tentativas / 15 min
  | 'login_admin_ip' // 20 tentativas / 15 min
  | 'marcacoes_por_sessao' // 10 / min
  | 'leitura_por_sessao' // 120 / min
  | 'global_por_ip'; // 300 / min

/** Escopos que devem falhar **fechado** se o Redis estiver indisponível (login = segurança). */
const ESCOPOS_FALHA_FECHADA = new Set<EscopoRateLimit>([
  'login_matricula',
  'login_matricula_acumulado',
  'login_ip',
  'login_ip_acumulado',
  'login_admin_email',
  'login_admin_ip',
]);

interface ConfigLimite {
  limite: number;
  janelaSegundos: number;
}

const LIMITES: Record<EscopoRateLimit, ConfigLimite> = {
  login_matricula: { limite: 5, janelaSegundos: 15 * 60 },
  login_matricula_acumulado: { limite: 10, janelaSegundos: 24 * 60 * 60 },
  login_ip: { limite: 20, janelaSegundos: 15 * 60 },
  login_ip_acumulado: { limite: 100, janelaSegundos: 24 * 60 * 60 },
  login_admin_email: { limite: 5, janelaSegundos: 15 * 60 },
  login_admin_ip: { limite: 20, janelaSegundos: 15 * 60 },
  marcacoes_por_sessao: { limite: 10, janelaSegundos: 60 },
  leitura_por_sessao: { limite: 120, janelaSegundos: 60 },
  global_por_ip: { limite: 300, janelaSegundos: 60 },
};

export function falhaFechadaPara(escopo: EscopoRateLimit): boolean {
  return ESCOPOS_FALHA_FECHADA.has(escopo);
}

/**
 * Fábrica de limitadores. Isolada da instância de Redis para permitir injeção
 * de um cliente fake em teste (o teste não bate em rede).
 */
export function criarLimitadores(redis: Redis): Record<EscopoRateLimit, Ratelimit> {
  const limitadores = {} as Record<EscopoRateLimit, Ratelimit>;
  for (const [escopo, config] of Object.entries(LIMITES) as Array<[EscopoRateLimit, ConfigLimite]>) {
    limitadores[escopo] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limite, `${config.janelaSegundos} s`),
      prefix: `ratelimit:${escopo}`,
    });
  }
  return limitadores;
}

let redisSingleton: Redis | null = null;
function redisPadrao(): Redis {
  redisSingleton ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return redisSingleton;
}

let limitadoresSingleton: Record<EscopoRateLimit, Ratelimit> | null = null;

/**
 * Verifica o limite de `escopo` para `identificador` (matrícula, IP ou
 * sessão, conforme o escopo). Se o Redis falhar:
 * - escopos de login: devolve `permitido: false` (falha fechada);
 * - demais escopos: devolve `permitido: true` (falha aberta).
 */
export async function verificarRateLimit(
  escopo: EscopoRateLimit,
  identificador: string,
  limitadores: Record<EscopoRateLimit, Ratelimit> = (limitadoresSingleton ??= criarLimitadores(redisPadrao())),
): Promise<DecisaoRateLimit> {
  const config = LIMITES[escopo];
  try {
    const resultado = await limitadores[escopo].limit(identificador);
    const retryAfter = Math.max(0, Math.ceil((resultado.reset - Date.now()) / 1000));
    return {
      permitido: resultado.success,
      limite: resultado.limit,
      restante: resultado.remaining,
      retryAfter,
    };
  } catch {
    const aberto = !falhaFechadaPara(escopo);
    return {
      permitido: aberto,
      limite: config.limite,
      restante: aberto ? config.limite : 0,
      retryAfter: config.janelaSegundos,
    };
  }
}
