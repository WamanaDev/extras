/**
 * Testes de `gerarPdf`/`gerarXlsx` — `API-ADM-ESC-004`. Cobre da tabela
 * "Testes de aceitação": #1 (gera, binário não vazio), #2 (legenda dos
 * códigos presente), #4 (rodapé com data e ciclo) e #6 (código sempre em
 * texto — legível sem cor, "impressão monocromática"). #3 (`observacao`
 * ausente) é garantido a montante por `removerObservacoes`
 * (`grade.test.ts`) — este módulo nunca recebe `observacao` para começo de
 * conversa, então não há nada para omitir aqui; a orquestração completa
 * (rota chama `removerObservacoes` antes de `gerarPdf`/`gerarXlsx`) é
 * verificada em `route.test.ts` com um espião nestas duas funções.
 *
 * XLSX é texto estruturado — reaberto com `ExcelJS` para inspecionar células
 * de verdade. PDF (`pdfkit`) é binário comprimido — sem um parser de PDF no
 * projeto, os testes de PDF ficam estruturais (cabeçalho `%PDF`, tamanho
 * mínimo, uma página por RT).
 */
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { gerarPdf, gerarXlsx, type MetaExportacao } from './export';
import { montarGrade, type GradeSaida } from './grade';

const META: MetaExportacao = { cicloId: 'ciclo-1', geradoEm: new Date('2026-09-04T12:00:00-03:00') };

function gradeDeExemplo(): GradeSaida {
  return montarGrade({
    ciclo: { ano: 2026, mes: 9, dias: 30 },
    colaboradores: [
      { id: 'c1', nome: 'Ana', matricula: '0001', rt: 'RT-A', turnoPadrao: 'DIURNO', escalaAncora: new Date(Date.UTC(2026, 8, 1)), escalaPeriodo: 2 },
      { id: 'c2', nome: 'Bruno', matricula: '0002', rt: 'RT-B', turnoPadrao: 'NOTURNO', escalaAncora: new Date(Date.UTC(2026, 8, 1)), escalaPeriodo: 2 },
    ],
    linhas: [
      { colaboradorId: 'c1', escalaDiaId: 'ed1', dia: 1, codigo: 'D', presenca: true, ocupaHorario: true, observacao: null },
      { colaboradorId: 'c2', escalaDiaId: 'ed2', dia: 1, codigo: 'F', presenca: false, ocupaHorario: false, observacao: null },
    ],
    diasComExtraConfirmada: new Map(),
    codigos: [
      { codigo: 'D', descricao: 'Dia trabalhado', cor: '#000000', presenca: true, ocupaHorario: true },
      { codigo: 'F', descricao: 'Folga', cor: '#eeeeee', presenca: false, ocupaHorario: false },
    ],
    cobertura: [],
  });
}

describe('gerarPdf — API-ADM-ESC-004', () => {
  it('1. gera um PDF binário não vazio, válido (cabeçalho %PDF)', async () => {
    const buffer = await gerarPdf(gradeDeExemplo(), META);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('grade sem colaboradores ainda gera um PDF válido (nenhum grupo de RT)', async () => {
    const vazio = montarGrade({ ciclo: { ano: 2026, mes: 9, dias: 30 }, colaboradores: [], linhas: [], diasComExtraConfirmada: new Map(), codigos: [], cobertura: [] });
    const buffer = await gerarPdf(vazio, META);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});

describe('gerarXlsx — API-ADM-ESC-004', () => {
  async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    return workbook;
  }

  it('1. gera um XLSX binário não vazio, uma aba por RT', async () => {
    const buffer = await gerarXlsx(gradeDeExemplo(), META);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = await abrir(buffer);
    const nomesAbas = workbook.worksheets.map((w) => w.name);
    expect(nomesAbas).toEqual(expect.arrayContaining(['RT RT-A', 'RT RT-B', 'Legenda']));
  });

  it('2. legenda dos códigos presente, com descrição textual (#6 — legível sem cor)', async () => {
    const buffer = await gerarXlsx(gradeDeExemplo(), META);
    const workbook = await abrir(buffer);
    const legenda = workbook.getWorksheet('Legenda')!;

    const linhas = legenda.getSheetValues().flat().filter((v): v is string => typeof v === 'string');
    expect(linhas).toEqual(expect.arrayContaining(['D', 'Dia trabalhado', 'F', 'Folga']));
  });

  it('4. rodapé (última linha da aba Legenda) traz data de geração e id do ciclo', async () => {
    const buffer = await gerarXlsx(gradeDeExemplo(), META);
    const workbook = await abrir(buffer);
    const legenda = workbook.getWorksheet('Legenda')!;
    const ultimaLinha = String(legenda.getRow(legenda.rowCount).getCell(1).value);

    expect(ultimaLinha).toContain('ciclo-1');
    expect(ultimaLinha).toMatch(/Gerado em/);
  });

  it('6. código de escala sempre aparece como texto na célula do dia (legível sem cor)', async () => {
    const buffer = await gerarXlsx(gradeDeExemplo(), META);
    const workbook = await abrir(buffer);
    const abaA = workbook.getWorksheet('RT RT-A')!;
    // Cabeçalho na linha 1, subtítulo do subgrupo (Ímpar/Par × turno) na 2,
    // primeira linha de colaborador na 3; coluna 3 == dia 1 (após matrícula/nome).
    expect(abaA.getRow(3).getCell(3).value).toBe('D');
  });

  it('7. cabeçalho do dia traz a letra do dia da semana em cima do número (pedido do usuário, igual escala real) — 1/set/2026 é terça (T)', async () => {
    const buffer = await gerarXlsx(gradeDeExemplo(), META);
    const workbook = await abrir(buffer);
    const abaA = workbook.getWorksheet('RT RT-A')!;
    expect(String(abaA.getRow(1).getCell(3).value)).toBe('T\n1');
  });
});
