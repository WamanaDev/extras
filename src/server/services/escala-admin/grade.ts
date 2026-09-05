/**
 * Montagem em memória da grade colaboradores × dias — `API-ADM-ESC-001`.
 *
 * Função pura (sem I/O): a rota busca as linhas já filtradas/joinadas do
 * banco (`escala_dia` + `colaborador` + `codigo_escala`, mais as marcações
 * confirmadas do ciclo) e este módulo só monta a matriz e os totais. Mantido
 * separado de `route.ts` para ser testável sem Prisma/`next/server`.
 */
import { HORAS_POR_BLOCO } from '@/lib/escala/blocos';
import { trabalhaEm } from '@/lib/escala/ancora';

export interface ColaboradorGradeEntrada {
  id: string;
  nome: string;
  matricula: string;
  rt: string;
  turnoPadrao: 'DIURNO' | 'NOTURNO';
  /** Âncora + periodicidade (DOM-001) — única fonte confiável de paridade, ver `ColaboradorGradeSaida.paridade`. */
  escalaAncora: Date;
  escalaPeriodo: number;
}

export interface LinhaEscalaGradeEntrada {
  colaboradorId: string;
  escalaDiaId: string;
  /** Dia do mês (1-31) — já derivado de `escala_dia.data`. */
  dia: number;
  codigo: string;
  presenca: boolean;
  ocupaHorario: boolean;
  observacao: string | null;
}

export interface CodigoGradeEntrada {
  codigo: string;
  descricao: string;
  cor: string;
  presenca: boolean;
  ocupaHorario: boolean;
}

export interface CelulaGrade {
  escalaDiaId: string;
  codigo: string;
  turno: 'DIURNO' | 'NOTURNO';
  temExtra: boolean;
  /**
   * Turno do PLANTÃO da extra (não o `turnoPadrao` do colaborador) — uma
   * extra cruzada de turno (ex.: colaborador diurno pegando extra noturna)
   * precisa aparecer no agrupamento "Extras Noturno", não "Diurno". Só
   * presente quando `temExtra` é `true`.
   */
  extraTurno?: 'DIURNO' | 'NOTURNO';
  /**
   * RT do PLANTÃO da extra (não a RT do colaborador) — uma extra cruzada de
   * RT (colaborador de uma RT cobrindo plantão de outra) precisa aparecer na
   * seção "Extras" da RT do plantão coberto, não na RT de origem do
   * colaborador (`RN-20`, `cruzada`). Só presente quando `temExtra` é `true`.
   */
  extraRt?: string;
  observacao?: string;
}

export interface ColaboradorGradeSaida {
  id: string;
  nome: string;
  matricula: string;
  rt: string;
  turnoPadrao: 'DIURNO' | 'NOTURNO';
  /**
   * Paridade do colaborador NESTE ciclo (`01-dominio/escala-12x36.md` — a
   * paridade "vira sozinha" mês a mês, nunca é armazenada). Derivada da
   * âncora (`trabalhaEm`, `lib/escala/ancora.ts`) — a MESMA fonte usada pra
   * gerar a escala em si, não uma releitura do código do dia 1/2. Fonte
   * única reaproveitada por `<GradeEscala />`, `<EscalaImpressao />` e
   * `export.ts` (PDF/XLSX) pra agrupar Ímpar/Par — puramente organização
   * visual (pedido do usuário), nenhuma regra de negócio depende disso.
   *
   * Antes era inferida olhando `presenca` do código dos dias 1/2 — quebrava
   * assim que os dois viravam um código de ausência (ex.: férias em lote
   * cobrindo o mês inteiro): nem dia 1 nem dia 2 tinham `presenca = true`, e
   * o fallback assumia `IMPAR` incondicionalmente, jogando colaboradores
   * `PAR` na seção errada da grade (achado em uso real, `_conflitos.md`).
   */
  paridade: 'IMPAR' | 'PAR';
  dias: Record<number, CelulaGrade>;
  /**
   * Extras confirmadas do colaborador neste ciclo — fonte independente de
   * `dias`. Uma extra tipicamente acontece justo no dia de FOLGA do
   * colaborador; se `escala_dia` só tem linha pros dias que a 12x36 realmente
   * define pra ele (`01-dominio/escala-12x36.md`), o dia da extra pode não
   * ter célula em `dias` — sem este campo a extra ficava só contada em
   * `totais.extras`, sem aparecer em lugar nenhum da UI/impressão/PDF
   * (achado em uso real). `<GradeEscala />`/`<EscalaImpressao />`/`export.ts`
   * usam ESTE campo (não `dias`) pra montar as seções "Extras Diurno/Noturno".
   */
  extras: ExtraColaboradorGradeSaida[];
  totais: { trabalhados: number; folgas: number; extras: number; horas: number };
}

export interface ExtraColaboradorGradeSaida {
  dia: number;
  turno: 'DIURNO' | 'NOTURNO';
  /** RT do plantão coberto — pode divergir da RT do colaborador (cruzada). */
  rt: string;
}

export interface CoberturaDiaGradeEntrada {
  dia: number;
  rt: string;
  turno: 'DIURNO' | 'NOTURNO';
  total: number;
  minimo: number;
}

export interface GradeSaida {
  ciclo: { ano: number; mes: number; dias: number };
  colaboradores: ColaboradorGradeSaida[];
  codigos: CodigoGradeEntrada[];
  coberturaPorDia: Record<number, { rt: string; turno: 'DIURNO' | 'NOTURNO'; total: number; minimo: number }>;
}

/**
 * `chaveExtra` — formato usado para indexar "este colaborador tem extra
 * confirmada neste dia do mês, deste turno/RT", vindo de uma consulta
 * separada de `marcacao`+`plantao`. Um `Map<string, {turno, rt}>` de chaves
 * `${colaboradorId}:${dia}` evita carregar as marcações completas na
 * resposta do admin — `temExtra`/`extraTurno`/`extraRt` é só o suficiente
 * pra marcar e agrupar a célula (o detalhe da extra em si é escopo de
 * `API-ADM-MAR-*`, não desta grade).
 */
export function chaveExtra(colaboradorId: string, dia: number): string {
  return `${colaboradorId}:${dia}`;
}

export interface ExtraConfirmadaEntrada {
  turno: 'DIURNO' | 'NOTURNO';
  /** RT do PLANTÃO coberto pela extra — pode divergir da RT do colaborador (cruzada). */
  rt: string;
}

export function montarGrade(params: {
  ciclo: { ano: number; mes: number; dias: number };
  colaboradores: ColaboradorGradeEntrada[];
  linhas: LinhaEscalaGradeEntrada[];
  diasComExtraConfirmada: ReadonlyMap<string, ExtraConfirmadaEntrada>;
  codigos: CodigoGradeEntrada[];
  cobertura: CoberturaDiaGradeEntrada[];
}): GradeSaida {
  const { ciclo, colaboradores, linhas, diasComExtraConfirmada, codigos, cobertura } = params;

  const linhasPorColaborador = new Map<string, LinhaEscalaGradeEntrada[]>();
  for (const linha of linhas) {
    const lista = linhasPorColaborador.get(linha.colaboradorId) ?? [];
    lista.push(linha);
    linhasPorColaborador.set(linha.colaboradorId, lista);
  }

  // Independente de `linhas`/`escala_dia` — ver docstring de `ColaboradorGradeSaida.extras`.
  const extrasPorColaborador = new Map<string, ExtraColaboradorGradeSaida[]>();
  for (const [chave, extra] of diasComExtraConfirmada.entries()) {
    const separador = chave.lastIndexOf(':');
    const colaboradorId = chave.slice(0, separador);
    const dia = Number(chave.slice(separador + 1));
    const lista = extrasPorColaborador.get(colaboradorId) ?? [];
    lista.push({ dia, turno: extra.turno, rt: extra.rt });
    extrasPorColaborador.set(colaboradorId, lista);
  }
  for (const lista of extrasPorColaborador.values()) lista.sort((a, b) => a.dia - b.dia);

  const colaboradoresSaida: ColaboradorGradeSaida[] = colaboradores.map((colaborador) => {
    const linhasDoColaborador = linhasPorColaborador.get(colaborador.id) ?? [];
    const dias: Record<number, CelulaGrade> = {};
    let trabalhados = 0;
    let folgas = 0;

    for (const linha of linhasDoColaborador) {
      const extra = diasComExtraConfirmada.get(chaveExtra(colaborador.id, linha.dia));
      const celula: CelulaGrade = {
        escalaDiaId: linha.escalaDiaId,
        codigo: linha.codigo,
        turno: colaborador.turnoPadrao,
        temExtra: extra !== undefined,
      };
      if (extra !== undefined) {
        celula.extraTurno = extra.turno;
        celula.extraRt = extra.rt;
      }
      if (linha.observacao) celula.observacao = linha.observacao;
      dias[linha.dia] = celula;

      if (linha.presenca) trabalhados += 1;
      else folgas += 1;
    }

    let extras = 0;
    for (let dia = 1; dia <= ciclo.dias; dia++) {
      if (diasComExtraConfirmada.has(chaveExtra(colaborador.id, dia))) extras += 1;
    }

    const horas = (trabalhados + extras) * HORAS_POR_BLOCO;

    // Ímpar se a âncora define que o colaborador trabalha no dia 1 (ímpar) do
    // ciclo — mesma função (`trabalhaEm`) que gera a escala em si, não uma
    // releitura do código do dia 1/2 (ver doc-comment de `paridade` acima:
    // essa releitura quebrava com ausência cobrindo o mês inteiro).
    const primeiroDiaDoCiclo = new Date(Date.UTC(ciclo.ano, ciclo.mes - 1, 1));
    const paridade: 'IMPAR' | 'PAR' = trabalhaEm(primeiroDiaDoCiclo, colaborador.escalaAncora, colaborador.escalaPeriodo) ? 'IMPAR' : 'PAR';

    return {
      id: colaborador.id,
      nome: colaborador.nome,
      matricula: colaborador.matricula,
      rt: colaborador.rt,
      turnoPadrao: colaborador.turnoPadrao,
      paridade,
      dias,
      extras: extrasPorColaborador.get(colaborador.id) ?? [],
      totais: { trabalhados, folgas, extras, horas },
    };
  });

  const coberturaPorDia: GradeSaida['coberturaPorDia'] = {};
  for (const linha of cobertura) {
    coberturaPorDia[linha.dia] = { rt: linha.rt, turno: linha.turno, total: linha.total, minimo: linha.minimo };
  }

  return { ciclo, colaboradores: colaboradoresSaida, codigos, coberturaPorDia };
}

/** `observacao` é restrita ao admin (SEC-CONF, CIA "C" de `API-ADM-ESC-001`) — usado por quem serve a mesma grade a `API-COL-002`. */
export function removerObservacoes(grade: GradeSaida): GradeSaida {
  return {
    ...grade,
    colaboradores: grade.colaboradores.map((colaborador) => ({
      ...colaborador,
      dias: Object.fromEntries(
        Object.entries(colaborador.dias).map(([dia, celula]) => {
          const { observacao: _observacao, ...resto } = celula;
          return [dia, resto];
        }),
      ),
    })),
  };
}
