/**
 * `admin-plantoes` (API-ADM-PLA-001..004) — helpers puros compartilhados
 * pelas 4 rotas. Nenhuma função aqui faz I/O; isso mantém tudo testável sem
 * mock de Prisma (as rotas cobrem a parte com I/O nos próprios testes de
 * aceitação, injetando um `tx` fake).
 *
 * Duas dessas funções espelham cálculo que o banco já faz por trigger
 * (`03-banco/triggers.md`, `preencher_intervalo`) — **não** para a aplicação
 * escrever `inicio_em`/`fim_em` (isso continua proibido, SEC-INT: a
 * aplicação nunca escreve esses campos), mas porque `API-ADM-PLA-003`
 * precisa saber o *novo* intervalo do plantão para propagar às marcações
 * confirmadas **na mesma transação** — responsabilidade explícita do handler
 * (`triggers.md`, seção `copiar_intervalo_marcacao`: "Alterar o horário de
 * um plantão exige propagar para as marcações confirmadas na mesma
 * transação — responsabilidade de API-ADM-PLA-003, não deste trigger").
 * Divergir da fórmula do trigger aqui reintroduziria exatamente o risco que
 * a spec queria evitar com uma "fonte única" — por isso a fórmula é copiada
 * ao pé da letra, não "melhorada".
 */
import type { Turno } from '@prisma/client';

/** `HH:MM`, 24h. */
export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Horário padrão de cada turno de 12h (DOM-001/FUND-002) — usado quando a rota não recebe `horaInicio`/`horaFim` explícitos. */
export function horasPadraoDoTurno(tipo: Turno): { horaInicio: string; horaFim: string } {
  return tipo === 'DIURNO' ? { horaInicio: '07:00', horaFim: '19:00' } : { horaInicio: '19:00', horaFim: '07:00' };
}

/**
 * `HH:MM` → `[horas, minutos]`. Entrada já passou por `HORA_REGEX` na borda
 * (schema Zod da rota) — este parse nunca deveria falhar em produção, mas
 * `noUncheckedIndexedAccess` exige que o retorno de `split` seja tratado
 * como possivelmente ausente; lançar aqui em vez de `!` mantém o erro
 * localizável caso um caller interno (`./util.ts` mesmo) chame fora da
 * borda validada.
 */
function partesHora(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(':');
  if (h === undefined || m === undefined) {
    throw new Error(`Hora em formato inesperado: "${hhmm}".`);
  }
  return [Number(h), Number(m)];
}

/** `HH:MM` → `Date` num "dia zero" fixo — só a hora importa para uma coluna `@db.Time`. */
export function horaParaData(hhmm: string): Date {
  const [h, m] = partesHora(hhmm);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

/** Inverso de `horaParaData` — lê de volta `HH:MM` de um valor `@db.Time` vindo do Prisma. */
export function dataParaHora(data: Date): string {
  const h = String(data.getUTCHours()).padStart(2, '0');
  const m = String(data.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function minutosDoDia(hhmm: string): number {
  const [h, m] = partesHora(hhmm);
  return h * 60 + m;
}

/**
 * Carga horária em horas inteiras, mesma regra de `hora_fim <= hora_inicio`
 * usada por `preencher_intervalo` para identificar turno que cruza a
 * meia-noite. `plantao.carga_horas` é `NOT NULL` sem trigger que o calcule
 * (`03-banco/triggers.md` não lista `carga_horas` — só `inicio_em`/`fim_em`)
 * — a aplicação é a única fonte deste campo.
 */
export function calcularCargaHoras(horaInicio: string, horaFim: string): number {
  const inicio = minutosDoDia(horaInicio);
  const fim = minutosDoDia(horaFim);
  const minutos = fim <= inicio ? 24 * 60 - inicio + fim : fim - inicio;
  return Math.round(minutos / 60);
}

/**
 * Espelha `preencher_intervalo` (`03-banco/triggers.md`) em TS: `inicioEm`/
 * `fimEm` a partir de `data` (civil) + `horaInicio`/`horaFim`, timezone fixo
 * `America/Sao_Paulo` (UTC−3, sem horário de verão desde 2019 — mesma
 * premissa de `src/lib/escala/blocos.ts`).
 */
const OFFSET_SAO_PAULO_HORAS = 3;

export function calcularIntervalo(data: Date, horaInicio: string, horaFim: string): { inicioEm: Date; fimEm: Date } {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  const dia = data.getUTCDate();
  const [hIni, mIni] = partesHora(horaInicio);
  const [hFim, mFim] = partesHora(horaFim);

  const inicioEm = new Date(Date.UTC(ano, mes, dia, hIni + OFFSET_SAO_PAULO_HORAS, mIni));
  const cruzaMeiaNoite = minutosDoDia(horaFim) <= minutosDoDia(horaInicio);
  const fimEm = new Date(Date.UTC(ano, mes, dia + (cruzaMeiaNoite ? 1 : 0), hFim + OFFSET_SAO_PAULO_HORAS, mFim));

  return { inicioEm, fimEm };
}

/** `data` (civil, sem hora) está dentro do mês/ano do ciclo — `API-ADM-PLA-001`/`002`, `DATA_FORA_DO_CICLO`. */
export function dataDentroDoCiclo(data: Date, ano: number, mes: number): boolean {
  return data.getUTCFullYear() === ano && data.getUTCMonth() + 1 === mes;
}

/** Dia da semana (0=domingo..6=sábado) em UTC — `data` de `plantao`/`escala_dia` não tem componente de hora, então não há risco de fuso deslocar o dia. */
export function diaDaSemana(data: Date): number {
  return data.getUTCDay();
}

/**
 * Paridade do DIA DO MÊS (`data.getUTCDate()` par/ímpar) — pedido do usuário
 * para o gerador de lote de plantões (`API-ADM-PLA-002`): filtrar um
 * intervalo só nos dias pares ou só nos ímpares do calendário. Não confundir
 * com a paridade de ESCALA (`src/lib/escala/ancora.ts`, `Paridade`), que é
 * relativa à âncora de cada colaborador — esta aqui é sempre absoluta
 * (dia 1, 3, 5... é ímpar pra qualquer plantão, não depende de ninguém).
 */
export function paridadeDoDia(data: Date): 'PAR' | 'IMPAR' {
  return data.getUTCDate() % 2 === 0 ? 'PAR' : 'IMPAR';
}

/** Itera cada dia civil de `[de, ate]`, inclusive dos dois lados. */
export function* diasEntre(de: Date, ate: Date): Generator<Date> {
  const cursor = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()));
  const fim = new Date(Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate()));
  while (cursor.getTime() <= fim.getTime()) {
    yield new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/** `YYYY-MM-DD`, para respostas e chaves de dedupe — nunca `toISOString()` (que traz hora/timezone). */
export function dataParaChave(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
