/**
 * Códigos de erro de negócio específicos de `API-ADM-PLA-001..004`, fora do
 * catálogo fechado de `src/server/http/erros.ts` (`CodigoErro =
 * CodigoErroInfra | CodigoErroNegocio | ErroApi`, e `CodigoErroNegocio` só
 * tem `'REGRA_DE_NEGOCIO'`). Ver `_conflitos.md`, item sobre
 * `admin-plantoes` × `contrato-comum.md`: as 4 specs desta pasta exigem
 * códigos literais (`PLANTAO_JA_EXISTE`, `CICLO_FECHADO`,
 * `DATA_FORA_DO_CICLO`, `VAGAS_MENOR_QUE_OCUPADAS`,
 * `IMPACTO_NAO_CONFIRMADO`, `EXCEDE_JORNADA`) que o catálogo de `erros.ts`
 * não modela — e o mesmo padrão se repete em quase toda `04-api/*`
 * (`CICLO_FECHADO`/`EXCEDE_JORNADA` aparecem em pelo menos oito specs
 * diferentes). Em vez de editar `erros.ts` (arquivo compartilhado, tocado
 * em paralelo por outros 8 agentes nesta rodada — editar agora arrisca
 * perder a edição de outro agente, sem controle de versão nesta pasta) o
 * `codigo` é construído aqui com um cast local e confinado: resolve
 * `admin-plantoes` sem tocar infraestrutura comum. Ver `ErroHttp.codigo`
 * (`erros.ts`) — o campo é só `string` em tempo de execução, o cast é
 * puramente de tipo.
 */
import { ErroHttp, type CodigoErro } from '@/server/http/erros';

export type CodigoErroPlantoes =
  | 'PLANTAO_JA_EXISTE'
  | 'CICLO_FECHADO'
  | 'DATA_FORA_DO_CICLO'
  | 'VAGAS_MENOR_QUE_OCUPADAS'
  | 'IMPACTO_NAO_CONFIRMADO'
  | 'EXCEDE_JORNADA'
  | 'MOTIVO_OBRIGATORIO'
  | 'LOTE_EXCEDE_TETO';

/** `409` — regra de negócio de `admin-plantoes` recusou a operação (mensagem em português, sem detalhe técnico). `detalhes` carrega a lista de afetados quando a spec pede ("409 com a lista" — `IMPACTO_NAO_CONFIRMADO`/`EXCEDE_JORNADA`). */
export function erroPlantao409(mensagem: string, codigo: CodigoErroPlantoes, detalhes: Record<string, string> | null = null): ErroHttp {
  return new ErroHttp({ status: 409, codigo: codigo as unknown as CodigoErro, mensagem, detalhes });
}

/** `422` — `DATA_FORA_DO_CICLO` é o único código desta pasta com esse status (payload logicamente inválido para o ciclo alvo, não regra de negócio). */
export function erroPlantao422(mensagem: string, codigo: CodigoErroPlantoes, detalhes: Record<string, string> | null = null): ErroHttp {
  return new ErroHttp({ status: 422, codigo: codigo as unknown as CodigoErro, mensagem, detalhes });
}
