/**
 * Renderização da grade para impressão/conferência — `API-ADM-ESC-004`.
 *
 * Nenhuma spec de `00-fundacao/stack.md` nomeia uma biblioteca de PDF/XLSX
 * (registrado em `_conflitos.md`, item 12). `pdfkit` e `exceljs` foram
 * adicionados a `package.json` por este agente — ambas puro-JS (sem passo de
 * build nativo), MIT, e as escolhas mais comuns para gerar os dois formatos
 * que o contrato exige (`?formato=pdf|xlsx`) a partir de Node sem
 * dependência de um binário externo (headless Chrome, LibreOffice etc.).
 *
 * `observacao` nunca chega a este módulo: a rota passa a grade já filtrada
 * por `removerObservacoes` (`./grade.ts`) — CIA "C" de `API-ADM-ESC-004`,
 * "observacao não entra no PDF afixado na parede".
 *
 * Agrupamento (pedido do usuário, mesmo de `<GradeEscala />`/
 * `<EscalaImpressao />`): um bloco por RT; dentro de cada RT, Ímpar Diurno →
 * Ímpar Noturno → Par Diurno → Par Noturno → Extras Diurno → Extras Noturno
 * — usa `colaborador.paridade`, já calculada em `grade.ts` (fonte única).
 */
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { letraDiaSemana } from '@/lib/escala/ancora';
import type { GradeSaida, ColaboradorGradeSaida } from './grade';

export interface MetaExportacao {
  cicloId: string;
  geradoEm: Date;
}

type GrupoBase = 'IMPAR_DIURNO' | 'IMPAR_NOTURNO' | 'PAR_DIURNO' | 'PAR_NOTURNO';

const ORDEM_GRUPOS_BASE: Array<{ chave: GrupoBase; titulo: string }> = [
  { chave: 'IMPAR_DIURNO', titulo: 'Ímpar Diurno' },
  { chave: 'IMPAR_NOTURNO', titulo: 'Ímpar Noturno' },
  { chave: 'PAR_DIURNO', titulo: 'Par Diurno' },
  { chave: 'PAR_NOTURNO', titulo: 'Par Noturno' },
];

/** Uma linha da tabela de extras — mesmo colaborador pode cobrir mais de um dia no mês, daí `dias` ser um conjunto. */
interface LinhaExtra {
  nome: string;
  matricula: string;
  dias: Set<number>;
}

interface GrupoRt {
  rt: string;
  base: Record<GrupoBase, ColaboradorGradeSaida[]>;
  extrasDiurno: LinhaExtra[];
  extrasNoturno: LinhaExtra[];
}

/** Agrupa por RT e, dentro de cada RT, por Ímpar/Par × turno + extras — mesma lógica de `<GradeEscala />`/`<EscalaImpressao />`, reaproveitada aqui pro PDF/XLSX ficarem consistentes com a tela. */
function agruparPorRt(grade: GradeSaida): GrupoRt[] {
  const porRt = new Map<string, ColaboradorGradeSaida[]>();
  for (const colaborador of grade.colaboradores) {
    const lista = porRt.get(colaborador.rt) ?? [];
    lista.push(colaborador);
    porRt.set(colaborador.rt, lista);
  }

  // Extras são atribuídas à RT do PLANTÃO coberto (`extraRt`), não à RT de
  // origem do colaborador — passe global, igual `<GradeEscala />`/`<EscalaImpressao />`.
  const extrasPorRt = new Map<string, { extrasDiurno: Map<string, LinhaExtra>; extrasNoturno: Map<string, LinhaExtra> }>();
  for (const colaborador of grade.colaboradores) {
    for (const extra of colaborador.extras) {
      const rtDaExtra = extra.rt ?? colaborador.rt;
      const bucket = extrasPorRt.get(rtDaExtra) ?? { extrasDiurno: new Map(), extrasNoturno: new Map() };
      const mapaDoTurno = extra.turno === 'DIURNO' ? bucket.extrasDiurno : bucket.extrasNoturno;
      const linha = mapaDoTurno.get(colaborador.id) ?? { nome: colaborador.nome, matricula: colaborador.matricula, dias: new Set<number>() };
      linha.dias.add(extra.dia);
      mapaDoTurno.set(colaborador.id, linha);
      extrasPorRt.set(rtDaExtra, bucket);
    }
  }
  for (const rt of [...extrasPorRt.keys()]) {
    if (!porRt.has(rt)) porRt.set(rt, []);
  }

  return [...porRt.entries()].map(([rt, colaboradores]) => {
    const base: Record<GrupoBase, ColaboradorGradeSaida[]> = {
      IMPAR_DIURNO: [],
      IMPAR_NOTURNO: [],
      PAR_DIURNO: [],
      PAR_NOTURNO: [],
    };
    for (const colaborador of colaboradores) {
      base[`${colaborador.paridade}_${colaborador.turnoPadrao}` as GrupoBase].push(colaborador);
    }

    const bucket = extrasPorRt.get(rt);
    const ordenar = (mapa?: Map<string, LinhaExtra>) => [...(mapa?.values() ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return { rt, base, extrasDiurno: ordenar(bucket?.extrasDiurno), extrasNoturno: ordenar(bucket?.extrasNoturno) };
  });
}

function formatarDataHora(data: Date): string {
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Conta quantas "linhas" o PDF precisa desenhar (cabeçalhos + colaboradores + extras) — usado só pra escolher um tamanho de fonte que caiba numa única página (melhor esforço, ver docstring do módulo). */
function contarLinhas(grupos: GrupoRt[]): number {
  let linhas = 0;
  for (const grupo of grupos) {
    linhas += 1; // cabeçalho da RT
    for (const { chave } of ORDEM_GRUPOS_BASE) {
      const colaboradores = grupo.base[chave];
      if (colaboradores.length === 0) continue;
      linhas += 1 + colaboradores.length; // subtítulo + uma linha por colaborador
    }
    if (grupo.extrasDiurno.length > 0) linhas += 1 + grupo.extrasDiurno.length; // subtítulo + uma linha por colaborador
    if (grupo.extrasNoturno.length > 0) linhas += 1 + grupo.extrasNoturno.length;
  }
  return linhas;
}

/** Extras em forma de tabela colaboradores × dias — mesmo formato dos plantões comuns (pedido do usuário), não uma linha corrida de "dia X nome". */
function desenharTabelaExtras(doc: PDFKit.PDFDocument, titulo: string, linhas: LinhaExtra[], diasDoCiclo: number): void {
  if (linhas.length === 0) return;
  doc.text(titulo, { underline: true, lineGap: 0 });
  for (const linha of linhas) {
    const celulas: string[] = [];
    for (let dia = 1; dia <= diasDoCiclo; dia++) celulas.push(linha.dias.has(dia) ? 'E' : '-');
    doc.text(`${linha.matricula} ${linha.nome}: ${celulas.join(' ')}`, { width: doc.page.width - 48, lineGap: 0 });
  }
}

/**
 * `gerarPdf` — A4 paisagem, **uma página por RT** (confirmado com o
 * usuário: cada RT sai na sua própria folha, nunca todas juntas numa única
 * A4). Dentro de cada página, escolhe fonte/altura de linha a partir do
 * total de linhas ESTIMADO SÓ PRA AQUELA RT (`contarLinhas` recebe um único
 * grupo) pra tentar caber tudo naquela folha; é melhor esforço, não uma
 * garantia matemática — uma RT com muitos colaboradores ainda pode
 * transbordar pra uma segunda página (pdfkit flui texto automaticamente
 * quando isso acontece, nunca corta dado). Legenda e rodapé repetem em toda
 * página — cada folha impressa fica autossuficiente pra quem só recebeu
 * aquela RT.
 */
export async function gerarPdf(grade: GradeSaida, meta: MetaExportacao): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const grupos = agruparPorRt(grade);
    // Área útil aproximada (pt): página A4 paisagem 842×595, margem 24 de cada lado,
    // reserva ~40pt pro título e ~30pt pro rodapé/legenda.
    const alturaUtil = 595 - 48 - 40 - 30;

    if (grupos.length === 0) {
      doc.fontSize(12).text('Nenhum colaborador para exibir.');
    }

    grupos.forEach((grupo, indice) => {
      if (indice > 0) doc.addPage();

      const { rt, base, extrasDiurno, extrasNoturno } = grupo;
      const totalLinhas = contarLinhas([grupo]) || 1;
      const alturaPorLinha = Math.max(6, Math.min(12, alturaUtil / totalLinhas));
      const fonteBase = Math.max(5, Math.min(9, alturaPorLinha - 2));

      doc.fontSize(12).text(`Escala ${grade.ciclo.mes}/${grade.ciclo.ano}`, { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(fonteBase + 2).text(`RT ${rt}`, { continued: false });
      doc.fontSize(fonteBase);

      for (const { chave, titulo } of ORDEM_GRUPOS_BASE) {
        const colaboradores = base[chave];
        if (colaboradores.length === 0) continue;
        doc.text(titulo, { underline: true, lineGap: 0 });
        for (const colaborador of colaboradores) {
          const celulas: string[] = [];
          for (let dia = 1; dia <= grade.ciclo.dias; dia++) {
            const celula = colaborador.dias[dia];
            celulas.push(celula ? celula.codigo + (celula.temExtra ? 'E' : '') : '-');
          }
          doc.text(`${colaborador.matricula} ${colaborador.nome}: ${celulas.join(' ')}`, {
            width: doc.page.width - 48,
            lineGap: 0,
          });
        }
      }

      desenharTabelaExtras(doc, 'Extras Diurno', extrasDiurno, grade.ciclo.dias);
      desenharTabelaExtras(doc, 'Extras Noturno', extrasNoturno, grade.ciclo.dias);

      doc.moveDown(0.5);
      doc.fontSize(Math.max(5, fonteBase - 1));
      doc.text(`Legenda: ${grade.codigos.map((c) => `${c.codigo}=${c.descricao}`).join(' · ')} · E = extra confirmada`, { lineGap: 0 });
      doc.text(`Gerado em ${formatarDataHora(meta.geradoEm)} — ciclo ${meta.cicloId}`, { lineGap: 0 });
    });

    doc.end();
  });
}

/** `gerarXlsx` — uma aba por RT, com os colaboradores agrupados por Ímpar/Par × turno (mesma ordem da tela) e uma seção de extras ao final da aba; aba de legenda dos códigos. */
export async function gerarXlsx(grade: GradeSaida, meta: MetaExportacao): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'admin-escala';
  workbook.created = meta.geradoEm;

  const grupos = agruparPorRt(grade);
  for (const { rt, base, extrasDiurno, extrasNoturno } of grupos) {
    const aba = workbook.addWorksheet(`RT ${rt}`.slice(0, 31));
    // Letra do dia da semana em cima do número (pedido do usuário, igual
    // planilha de escala real) — `header` vira duas linhas via `\n`, com
    // `wrapText` habilitado na linha de cabeçalho logo abaixo.
    const colunasDias = Array.from({ length: grade.ciclo.dias }, (_, i) => ({
      header: `${letraDiaSemana(grade.ciclo.ano, grade.ciclo.mes, i + 1)}\n${i + 1}`,
      key: `d${i + 1}`,
      width: 4,
    }));
    aba.columns = [
      { header: 'Matrícula', key: 'matricula', width: 12 },
      { header: 'Nome', key: 'nome', width: 28 },
      ...colunasDias,
      { header: 'Trabalhados', key: 'trabalhados', width: 12 },
      { header: 'Folgas', key: 'folgas', width: 10 },
      { header: 'Extras', key: 'extras', width: 10 },
      { header: 'Horas', key: 'horas', width: 10 },
    ];
    aba.getRow(1).alignment = { wrapText: true, horizontal: 'center' };

    for (const { chave, titulo } of ORDEM_GRUPOS_BASE) {
      const colaboradores = base[chave];
      if (colaboradores.length === 0) continue;

      const linhaTitulo = aba.addRow({ matricula: titulo });
      linhaTitulo.font = { bold: true };

      for (const colaborador of colaboradores) {
        const linha: Record<string, string | number> = { matricula: colaborador.matricula, nome: colaborador.nome };
        for (let dia = 1; dia <= grade.ciclo.dias; dia++) {
          linha[`d${dia}`] = colaborador.dias[dia]?.codigo ?? '';
        }
        linha.trabalhados = colaborador.totais.trabalhados;
        linha.folgas = colaborador.totais.folgas;
        linha.extras = colaborador.totais.extras;
        linha.horas = colaborador.totais.horas;
        aba.addRow(linha);
      }
    }

    // Extras em forma de tabela colaboradores × dias — mesmo layout dos blocos base acima (pedido do usuário), "E" no dia coberto.
    const adicionarTabelaExtras = (titulo: string, linhasExtra: LinhaExtra[]): void => {
      if (linhasExtra.length === 0) return;
      const linhaTitulo = aba.addRow({ matricula: titulo });
      linhaTitulo.font = { bold: true };
      for (const linha of linhasExtra) {
        const registro: Record<string, string | number> = { matricula: linha.matricula, nome: linha.nome };
        for (let dia = 1; dia <= grade.ciclo.dias; dia++) {
          if (linha.dias.has(dia)) registro[`d${dia}`] = 'E';
        }
        aba.addRow(registro);
      }
    };
    adicionarTabelaExtras('Extras Diurno', extrasDiurno);
    adicionarTabelaExtras('Extras Noturno', extrasNoturno);
  }

  const legenda = workbook.addWorksheet('Legenda');
  legenda.columns = [
    { header: 'Código', key: 'codigo', width: 10 },
    { header: 'Descrição', key: 'descricao', width: 24 },
    { header: 'Presença', key: 'presenca', width: 10 },
    { header: 'Ocupa horário', key: 'ocupaHorario', width: 14 },
  ];
  for (const codigo of grade.codigos) {
    legenda.addRow({ codigo: codigo.codigo, descricao: codigo.descricao, presenca: codigo.presenca ? 'sim' : 'não', ocupaHorario: codigo.ocupaHorario ? 'sim' : 'não' });
  }
  legenda.addRow({});
  legenda.addRow({ codigo: `Gerado em ${formatarDataHora(meta.geradoEm)} — ciclo ${meta.cicloId}` });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
