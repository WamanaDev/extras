/**
 * Códigos de erro de domínio específicos de `admin-escala`
 * (`CODIGO_INVALIDO`, `CICLO_FECHADO`, `IMPACTO_NAO_CONFIRMADO`,
 * `EXCEDE_JORNADA` — literais nos contratos de API-ADM-ESC-002/003).
 *
 * `src/server/http/erros.ts` (entregável de `API-000`, alteração exige
 * revisão humana) fixa `CodigoErro = CodigoErroInfra | CodigoErroNegocio |
 * ErroApi`, com `CodigoErroNegocio` restrito à literal única
 * `'REGRA_DE_NEGOCIO'`. Os quatro códigos exigidos aqui pelo contrato da
 * rota (checados em TS antes de tocar o banco — não vêm de SQLSTATE, então
 * não pertencem a `ErroApi`) não cabem nesse union fechado. Registrado em
 * `_conflitos.md` (item 12) em vez de decidido em silêncio — a resolução
 * mínima escolhida aqui é local a este módulo (um cast só neste arquivo, via
 * `erroDominioEscala`), sem tocar `erros.ts` (arquivo de alteração
 * restrita, editado em paralelo por 8 outros agentes na mesma onda).
 */
import { ErroHttp, type CodigoErro, type DetalhesValidacao } from '@/server/http/erros';

export type CodigoErroEscalaAdmin =
  | 'CODIGO_INVALIDO'
  | 'CICLO_FECHADO'
  | 'IMPACTO_NAO_CONFIRMADO'
  | 'EXCEDE_JORNADA';

/**
 * Constrói um `ErroHttp` com um dos códigos de domínio acima. Único ponto do
 * cast `as CodigoErro` neste módulo — nenhuma outra parte do código de
 * `admin-escala` referencia o tipo fechado diretamente.
 */
export function erroDominioEscala(
  status: 409 | 422,
  codigo: CodigoErroEscalaAdmin,
  mensagem: string,
  detalhes: DetalhesValidacao | null = null,
): ErroHttp {
  return new ErroHttp({ status, codigo: codigo as unknown as CodigoErro, mensagem, detalhes });
}
