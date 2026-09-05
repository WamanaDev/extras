/**
 * DOM-003 — Códigos de escala e ausências.
 *
 * `codigo_escala` é tabela, não enum: o admin cadastra códigos novos (atestado,
 * férias, licença) sem deploy. Este módulo é o espelho em TypeScript do
 * conjunto-base (`D`, `F`, `FT`, `FE`) e das regras que dependem só das duas
 * flags — não do catálogo completo, que vive no banco.
 *
 * As duas flags são perguntas diferentes (ver `01-dominio/codigos-escala.md`):
 *
 * - `presenca`    — "esta pessoa cobre o plantão?" (cobertura, impressão)
 * - `ocupaHorario` — "esta pessoa está comprometida neste intervalo?" (descanso, DOM-002)
 *
 * `FT` e `FE` respondem não à primeira e sim à segunda: quem está em treinamento
 * não cobre o plantão, mas também não pode encadear 24h de extra em volta.
 */

/** Um código de escala/ausência, como a linha correspondente em `codigo_escala`. */
export interface CodigoEscala {
  /** Identificador curto (`D`, `F`, `FT`, `FE`, ou código criado pelo admin). */
  codigo: string;
  descricao: string;
  /** Esta pessoa cobre o plantão? Usado na impressão e na cobertura mínima da RT. */
  presenca: boolean;
  /** Esta pessoa está comprometida neste intervalo? Usado na regra de descanso (DOM-002). */
  ocupaHorario: boolean;
  /** O dia é remunerado com este código. */
  remunerada: boolean;
  /** Código desativado não aparece para lançamento novo, mas permanece em uso histórico. */
  ativo: boolean;
  /**
   * Código fixo/padrão do sistema (D, F, FE — DOM-003.6, revisado a pedido do
   * usuário): não pode ter flags alteradas nem ser desativado/excluído.
   * Código criado pelo admin nasce sempre `false` — só os três seeds fixos
   * têm `true`, e nenhuma rota de API permite alterar esta coluna depois de
   * criada (só a migration/seed grava nela).
   */
  bloqueado: boolean;
  /** Cor da legenda/badge — precisa contraste mínimo 4.5:1 sobre branco (ver spec). */
  cor: string;
}

/**
 * Seed dos quatro códigos-base descritos em `01-dominio/codigos-escala.md`.
 *
 * Esta constante é a fonte da verdade em TypeScript para os valores de
 * `presenca`/`ocupaHorario`/`remunerada` do conjunto-base — mas NÃO é, por si
 * só, o seed SQL de `codigo_escala`: a tabela ainda não existe (ver
 * `_conflitos.md` na raiz, item sobre DOM-003). Quando a migration de
 * `03-banco` criar `codigo_escala`, o seed real deve inserir exatamente estas
 * linhas, na mesma ordem de flags.
 *
 * `F.remunerada` é `false` aqui por padrão: a spec descreve "conforme regra"
 * para esse código, ou seja, é um valor ajustável pelo admin por política de
 * ausência — não uma constante de domínio. Qualquer alteração desse valor
 * específico é decisão de cadastro, não de código.
 */
export const CODIGOS_BASE: readonly CodigoEscala[] = [
  { codigo: 'D', descricao: 'Disponível', presenca: true, ocupaHorario: true, remunerada: true, ativo: true, bloqueado: true, cor: '#2E7D32' },
  { codigo: 'F', descricao: 'Folga', presenca: false, ocupaHorario: false, remunerada: false, ativo: true, bloqueado: true, cor: '#616161' },
  { codigo: 'FT', descricao: 'Folga Treinamento', presenca: false, ocupaHorario: true, remunerada: true, ativo: true, bloqueado: false, cor: '#1565C0' },
  { codigo: 'FE', descricao: 'Férias', presenca: false, ocupaHorario: true, remunerada: true, ativo: true, bloqueado: true, cor: '#6A1B9A' },
];

/**
 * `contaCobertura` — este código conta na cobertura mínima da RT no dia/turno?
 * (DOM-003.4: código com `presenca = true` conta).
 */
export function contaCobertura(codigo: CodigoEscala): boolean {
  return codigo.presenca;
}

/**
 * `contaComoDescanso` — o intervalo deste dia libera o colaborador para
 * encadear jornada (extra)? Só quando `ocupaHorario = false` a pessoa está de
 * fato descansando; `presenca` sozinha não decide isso (ver "As duas flags").
 */
export function contaComoDescanso(codigo: CodigoEscala): boolean {
  return !codigo.ocupaHorario;
}

/**
 * `podeAlterarFlags` — o código pode ter `presenca`/`ocupaHorario`/`remunerada`
 * alteradas pelo admin? Código `bloqueado` (D/F/FE — DOM-003.6) não pode.
 */
export function podeAlterarFlags(codigo: Pick<CodigoEscala, 'bloqueado'>): boolean {
  return !codigo.bloqueado;
}

/**
 * `podeDesativar` — o código pode ser desativado pelo admin? Código
 * `bloqueado` (D/F/FE — DOM-003.6) não pode. Diferente de exclusão: código em
 * uso nunca é excluído (DOM-003.5), só desativado (`ativo = false`).
 */
export function podeDesativar(codigo: Pick<CodigoEscala, 'bloqueado'>): boolean {
  return !codigo.bloqueado;
}

/**
 * `podeExcluir` — excluir código em uso é proibido (DOM-003.5). `emUso` vem de
 * uma consulta no banco (há `escala_dia` referenciando este código?), não é
 * responsabilidade deste módulo descobrir.
 */
export function podeExcluir(emUso: boolean): boolean {
  return !emUso;
}

/**
 * `exigeConfirmacaoAoAlterar` — alterar ausência em dia com extra marcada
 * exige confirmação explícita e gera `audit_log` (DOM-003.3).
 */
export function exigeConfirmacaoAoAlterar(temExtraMarcadaNoDia: boolean): boolean {
  return temExtraMarcadaNoDia;
}

/**
 * `consomeCotaDeExtras` — ausência nunca consome cota de extras; são controles
 * independentes (DOM-003.2). Mantido como função (não constante) para deixar o
 * ponto de decisão explícito e testável, caso a regra algum dia deixe de ser
 * incondicional.
 */
export function consomeCotaDeExtras(): boolean {
  return false;
}

/** Somente admin lança ou altera ausência; colaborador só visualiza (DOM-003.1). */
export function podeLancarOuAlterarAusencia(atorEhAdmin: boolean): boolean {
  return atorEhAdmin;
}
