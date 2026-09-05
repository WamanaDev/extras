/**
 * Tradução dos erros de negócio de `FN-005 marcar_extra` e `FN-006
 * cancelar_extra` (`prisma/migrations/20260101000007_funcoes/migration.sql`)
 * para `ErroHttp`.
 *
 * ## Por que isto não é `src/server/http/erros.ts`
 *
 * `contrato-comum.md` (API-000) é `PRONTA — alteração exige revisão humana`,
 * e `erros.ts` é um dos seus entregáveis. O catálogo central
 * (`erroApiParaPostgres`, `MAPA_ERROS_POSTGRES`) traduz SQLSTATE →
 * erro de API — mas `marcar_extra`/`cancelar_extra` levantam a maior parte
 * dos seus erros de negócio via `RAISE EXCEPTION 'CODIGO'` puro (sem SQLSTATE
 * próprio: o Postgres usa `P0001`, "raised_exception", genérico), não via
 * violação de constraint. `MAPA_ERROS_POSTGRES` só mapeia SQLSTATE
 * específico de constraint (`23505`, `23P01`, `23514`, `23503`, `55P03`,
 * `40P01`) — `P0001` não está lá, e `erros.test.ts` afirma
 * `toHaveLength(7)`, então widen a tabela sem revisão humana quebraria esse
 * teste e o próprio limite da spec.
 *
 * **Registrado em `_conflitos.md`** (API-COL-004/005 × contrato-comum.md):
 * as duas specs de rota (`PRONTA`) listam explicitamente os códigos
 * `PLANTAO_INDISPONIVEL`, `CICLO_FECHADO`, `JANELA_NAO_ABERTA`,
 * `JANELA_ENCERRADA`, `COLABORADOR_BLOQUEADO`, `CRUZADA_BLOQUEADA`,
 * `EM_AUSENCIA`, `EXCEDE_JORNADA`, `LIMITE_ATINGIDO`,
 * `MARCACAO_INEXISTENTE` no corpo do contrato de erros da rota — sem este
 * módulo essas specs `PRONTA` seriam impossíveis de implementar (todo erro
 * de `FN-005`/`FN-006` que não seja violação de constraint cairia em `500
 * ERRO_INTERNO`, nunca no `409`/`404` documentado). Resolução mínima:
 * módulo novo, aditivo, que NÃO toca `erros.ts` — as rotas de
 * `04-api/colaborador/*` chamam `traduzirErroNegocioExtra` **antes** de
 * deixar o erro subir para o `try/catch` de `defineHandler`; se ele
 * devolver um `ErroHttp`, a rota relança (o passo "tradução de erro" do
 * pipeline já sabe repassar um `ErroHttp` inalterado — primeiro ramo de
 * `traduzirErro`). Se devolver `undefined` (erro não reconhecido, ex.
 * violação de constraint real ou erro de infra), a rota relança o erro
 * original, que segue para o caminho já existente (`erroApiParaPostgres`).
 *
 * `COLABORADOR_INATIVO` (passo 4 de `marcar_extra`) não está na tabela de
 * erros de `API-COL-004-marcar.md` — gap adicional, registrado no mesmo item
 * de `_conflitos.md`. Mapeado aqui mesmo assim (409, mensagem genérica) para
 * não devolver `500` num caminho de negócio plausível (sessão sobrevive à
 * desativação do colaborador).
 *
 * `MARCACAO_INEXISTENTE` (`FN-006`) é `404`, não `409` — mesma semântica de
 * `erroNaoEncontrado` (`contrato-comum.md`: "recurso de terceiro → 404,
 * nunca 403 — não vazamos existência"); por isso devolve exatamente o
 * resultado de `erroNaoEncontrado()`, não um código customizado.
 */
import { ErroHttp, erroNaoEncontrado, type CodigoErro } from '@/server/http/erros';
import { codigoSqlstate } from '@/server/db/tx';

/**
 * Códigos de negócio literais levantados por `RAISE EXCEPTION 'CODIGO'` em
 * `marcar_extra`/`cancelar_extra`. `MARCACAO_INEXISTENTE` tratado à parte
 * (404, via `erroNaoEncontrado`) — não entra neste mapa 409.
 */
const MENSAGENS: Record<string, string> = {
  PLANTAO_INDISPONIVEL: 'Este plantão não está mais disponível.',
  CICLO_FECHADO: 'Este ciclo está fechado.',
  JANELA_NAO_ABERTA: 'A janela de marcação ainda não abriu.',
  JANELA_ENCERRADA: 'A janela de marcação já encerrou.',
  COLABORADOR_INATIVO: 'Sua conta não está ativa. Fale com o RT.',
  COLABORADOR_BLOQUEADO: 'Você está bloqueado para marcar extras neste ciclo.',
  CRUZADA_BLOQUEADA: 'Marcação cruzada entre RTs não é permitida neste ciclo.',
  EM_AUSENCIA: 'Você está de folga ou ausência nesse dia.',
  CONFLITO_DE_HORARIO: 'Você já tem um compromisso nesse horário.',
  EXCEDE_JORNADA: 'Essa marcação ultrapassaria o limite de horas seguidas permitido.',
  LIMITE_ATINGIDO: 'Você atingiu o limite de extras deste ciclo.',
  SEM_VAGA: 'Não há mais vaga disponível para este plantão.',
};

/** Ordem de busca por substring — nenhum código é substring de outro (conferido), então a ordem não importa para corretude, só listada por legibilidade. */
const CODIGOS_CONHECIDOS = Object.keys(MENSAGENS);

function extrairMensagemBruta(erro: unknown): string {
  if (typeof erro !== 'object' || erro === null) return '';
  const candidato = erro as { message?: unknown };
  return typeof candidato.message === 'string' ? candidato.message : '';
}

/**
 * Traduz um erro de `marcar_extra`/`cancelar_extra` capturado dentro de
 * `emTransacao` para `ErroHttp`. Devolve `undefined` quando o erro não bate
 * com nenhum código conhecido — o chamador deve então relançar o erro
 * original para o pipeline padrão (`erroApiParaPostgres` / `500`) decidir.
 *
 * Não exige um SQLSTATE específico (`P0001`) porque o formato exato do erro
 * bruto do driver/Prisma para `RAISE EXCEPTION` varia por versão; em vez
 * disso casa a mensagem contra o catálogo de códigos conhecidos — esses
 * códigos são strings de negócio inconfundíveis (nunca aparecem em erro de
 * infraestrutura real), então o casamento por conteúdo é seguro.
 */
export function traduzirErroNegocioExtra(erro: unknown): ErroHttp | undefined {
  if (erro instanceof ErroHttp) return erro;

  const mensagem = extrairMensagemBruta(erro);
  if (!mensagem) return undefined;

  if (mensagem.includes('MARCACAO_INEXISTENTE')) {
    return erroNaoEncontrado('Marcação não encontrada.');
  }

  for (const codigo of CODIGOS_CONHECIDOS) {
    if (mensagem.includes(codigo)) {
      return new ErroHttp({
        status: 409,
        // `codigo` não pertence à união fechada `CodigoErro` de `erros.ts`
        // (módulo travado — ver docstring do arquivo). Cast local e
        // documentado: o valor em tempo de execução é exatamente o literal
        // do catálogo acima, que é o que a spec de rota exige no campo
        // `erro` da resposta.
        codigo: codigo as unknown as CodigoErro,
        mensagem: MENSAGENS[codigo] as string,
        causaOriginal: erro,
      });
    }
  }

  return undefined;
}

/** Reexportado só para os testes deste módulo não duplicarem o import de `tx.ts`. */
export { codigoSqlstate };
