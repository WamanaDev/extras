/**
 * Tradução dos erros de negócio de FN-010..016 (`prisma/migrations/
 * 20260907160000_pacientes_funcoes/migration.sql`) para `ErroHttp`.
 *
 * Mesmo racional de `@/server/services/colaborador/erros-negocio-extra.ts`:
 * essas funções levantam a maior parte dos erros via `RAISE EXCEPTION
 * 'CODIGO'` puro (SQLSTATE genérico `P0001`, sem constraint associada), não
 * via violação de constraint — então não passam pela tabela de
 * `db/erros.ts`. Este módulo casa a mensagem bruta contra o catálogo
 * conhecido; erro não reconhecido devolve `undefined` e o chamador relança o
 * original para o pipeline padrão decidir (`erroApiParaPostgres`/500).
 *
 * `*_INEXISTENTE` mapeiam para 404 (`erroNaoEncontrado`) — mesma semântica
 * de "recurso de terceiro" em `contrato-comum.md`. Os demais são `409`.
 * `VIGENCIA_INCONSISTENTE`/`*_OBRIGATORIO` de validação de payload (checados
 * em TS antes do banco) usam `422` e são lançados diretamente pelo service,
 * não por este tradutor — este módulo só cobre o que vem de dentro da
 * função SQL.
 */
import { ErroHttp, erroNaoEncontrado, type CodigoErro } from '@/server/http/erros';

const MENSAGENS_409: Record<string, string> = {
  PACIENTE_INDISPONIVEL: 'Este paciente não está disponível para esta ação.',
  INTERVALO_INVALIDO: 'O horário de início precisa ser antes do horário de fim.',
  AGENDAMENTO_RETROATIVO: 'Não é possível criar um agendamento no passado.',
  AGENDAMENTO_JA_ENCERRADO: 'Este agendamento já foi concluído ou cancelado.',
  PRESCRICAO_INATIVA: 'Esta prescrição não está ativa.',
  FORA_DA_VIGENCIA: 'Fora do período de vigência da prescrição.',
  PRESCRICAO_PRN_SEM_HORARIO: 'Prescrição "se necessário" não usa horário previsto.',
  DOSE_NAO_PREVISTA: 'Não há dose prevista para este horário.',
  DOSE_JA_SEPARADA: 'Esta dose já foi separada.',
  DOSE_NAO_SEPARADA: 'Esta dose ainda não foi separada.',
  CONFERENTE_IGUAL_SEPARADOR: 'Quem separou a dose não pode conferi-la — precisa ser outro colaborador.',
  DOSE_NAO_CONFERIDA: 'Esta dose ainda não foi conferida.',
  ADMINISTRADOR_NAO_PARTICIPOU: 'Só quem separou ou conferiu esta dose pode administrá-la.',
};

const MENSAGENS_422: Record<string, string> = {
  HORARIO_PREVISTO_OBRIGATORIO: 'Informe o horário previsto desta dose.',
  JUSTIFICATIVA_OBRIGATORIA: 'É obrigatório justificar.',
};

const MENSAGENS_404: Record<string, string> = {
  AGENDAMENTO_INEXISTENTE: 'Agendamento não encontrado.',
  ADMINISTRACAO_INEXISTENTE: 'Registro de administração não encontrado.',
};

function extrairMensagemBruta(erro: unknown): string {
  if (typeof erro !== 'object' || erro === null) return '';
  const candidato = erro as { message?: unknown };
  return typeof candidato.message === 'string' ? candidato.message : '';
}

/** Traduz um erro capturado dentro de `emTransacao` ao chamar FN-010..016. `undefined` se não reconhecido. */
export function traduzirErroNegocioPacientes(erro: unknown): ErroHttp | undefined {
  if (erro instanceof ErroHttp) return erro;

  const mensagem = extrairMensagemBruta(erro);
  if (!mensagem) return undefined;

  for (const [codigo, texto] of Object.entries(MENSAGENS_404)) {
    if (mensagem.includes(codigo)) return erroNaoEncontrado(texto);
  }

  for (const [codigo, texto] of Object.entries(MENSAGENS_422)) {
    if (mensagem.includes(codigo)) {
      return new ErroHttp({ status: 422, codigo: codigo as unknown as CodigoErro, mensagem: texto });
    }
  }

  for (const [codigo, texto] of Object.entries(MENSAGENS_409)) {
    if (mensagem.includes(codigo)) {
      return new ErroHttp({ status: 409, codigo: codigo as unknown as CodigoErro, mensagem: texto, causaOriginal: erro });
    }
  }

  return undefined;
}
