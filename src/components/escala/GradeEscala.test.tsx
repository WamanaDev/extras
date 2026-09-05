import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradeEscala, type GradeEscalaDados } from './GradeEscala';

function construirGrade(colaboradores: number, dias: number): GradeEscalaDados {
  const codigos = [
    { codigo: 'D', descricao: 'Dia trabalhado', cor: '#0f172a', presenca: true, ocupaHorario: true },
    { codigo: 'F', descricao: 'Folga', cor: '#16a34a', presenca: false, ocupaHorario: false },
    { codigo: 'FT', descricao: 'Folga treinamento', cor: '#f59e0b', presenca: false, ocupaHorario: true },
    { codigo: 'FE', descricao: 'Folga TRE', cor: '#7c3aed', presenca: false, ocupaHorario: true },
  ];

  return {
    ciclo: { ano: 2026, mes: 9, dias },
    codigos,
    coberturaPorDia: {},
    colaboradores: Array.from({ length: colaboradores }, (_valor, indice) => {
      const linhas: GradeEscalaDados['colaboradores'][number]['dias'] = {};
      for (let dia = 1; dia <= dias; dia++) {
        linhas[dia] = { escalaDiaId: `esc-${indice}-${dia}`, codigo: dia % 2 === 0 ? 'D' : 'F', turno: 'DIURNO', temExtra: false };
      }
      return {
        id: `col-${indice}`,
        nome: `Colaborador ${indice}`,
        matricula: `${1000 + indice}`,
        rt: 'RT-1',
        turnoPadrao: 'DIURNO',
        paridade: 'PAR',
        dias: linhas,
        extras: [],
        totais: { trabalhados: 15, folgas: 15, extras: 0, horas: 180 },
      };
    }),
  };
}

describe('GradeEscala — FE-1 (80x31, render < 1s)', () => {
  it('renderiza 80 colaboradores x 31 dias rapidamente', () => {
    const dados = construirGrade(80, 31);
    const inicio = performance.now();
    render(<GradeEscala cicloId="ciclo-1" dadosIniciais={dados} />);
    const duracao = performance.now() - inicio;
    expect(duracao).toBeLessThan(1000);
    expect(screen.getByRole('grid', { name: 'Grade de escala' })).toBeInTheDocument();
  });
});

describe('GradeEscala — FE-2 (célula sem cor, código legível)', () => {
  it('mostra o texto do código mesmo sem depender de cor', () => {
    const dados = construirGrade(2, 3);
    render(<GradeEscala cicloId="ciclo-1" dadosIniciais={dados} />);
    // O <select> da célula do colaborador 0, dia 1, tem valor 'F' (dia ímpar) — texto está sempre presente no DOM,
    // independente de qualquer estilo de cor aplicado via `style`.
    const celula = screen.getByLabelText('Colaborador 0, dia 1, código F') as HTMLSelectElement;
    expect(celula).toBeInTheDocument();
    expect(celula.value).toBe('F');
    // A opção selecionada tem o texto 'F' legível, não representado só por cor.
    expect(celula.selectedOptions[0]?.textContent).toBe('F');
  });
});

describe('GradeEscala — agrupamento por RT e Ímpar/Par × Diurno/Noturno (pedido do usuário)', () => {
  it('separa em blocos por RT, e dentro de cada RT na ordem Ímpar Diurno/Ímpar Noturno/Par Diurno/Par Noturno/Extras Diurno/Extras Noturno', () => {
    const dados: GradeEscalaDados = {
      ciclo: { ano: 2026, mes: 9, dias: 3 },
      codigos: [
        { codigo: 'D', descricao: 'Dia trabalhado', cor: '#000', presenca: true, ocupaHorario: true },
        { codigo: 'F', descricao: 'Folga', cor: '#111', presenca: false, ocupaHorario: false },
      ],
      coberturaPorDia: {},
      colaboradores: [
        // RT-1, ímpar (trabalha dia 1), diurno.
        {
          id: 'c-impar-diurno',
          nome: 'Ana',
          matricula: '1',
          rt: 'RT-1',
          turnoPadrao: 'DIURNO',
          paridade: 'IMPAR',
          dias: {
            1: { escalaDiaId: 'e1', codigo: 'D', turno: 'DIURNO', temExtra: false },
            2: { escalaDiaId: 'e2', codigo: 'F', turno: 'DIURNO', temExtra: false },
          },
          extras: [],
          totais: { trabalhados: 1, folgas: 1, extras: 0, horas: 12 },
        },
        // RT-1, par (folga dia 1, trabalha dia 2), noturno, com extra diurna.
        {
          id: 'c-par-noturno',
          nome: 'Bruno',
          matricula: '2',
          rt: 'RT-1',
          turnoPadrao: 'NOTURNO',
          paridade: 'PAR',
          dias: {
            1: { escalaDiaId: 'e3', codigo: 'F', turno: 'NOTURNO', temExtra: false },
            2: { escalaDiaId: 'e4', codigo: 'D', turno: 'NOTURNO', temExtra: false },
            3: { escalaDiaId: 'e5', codigo: 'F', turno: 'NOTURNO', temExtra: true, extraTurno: 'DIURNO', extraRt: 'RT-1' },
          },
          extras: [{ dia: 3, turno: 'DIURNO', rt: 'RT-1' }],
          totais: { trabalhados: 1, folgas: 2, extras: 1, horas: 24 },
        },
        // RT-2, ímpar, diurno — RT diferente, deve virar seção separada.
        {
          id: 'c-rt2',
          nome: 'Carla',
          matricula: '3',
          rt: 'RT-2',
          turnoPadrao: 'DIURNO',
          paridade: 'IMPAR',
          dias: {
            1: { escalaDiaId: 'e6', codigo: 'D', turno: 'DIURNO', temExtra: false },
          },
          extras: [],
          totais: { trabalhados: 1, folgas: 0, extras: 0, horas: 12 },
        },
      ],
    };

    render(<GradeEscala cicloId="ciclo-1" dadosIniciais={dados} />);

    // Duas seções de RT.
    expect(screen.getByRole('heading', { level: 2, name: 'RT-1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'RT-2' })).toBeInTheDocument();

    // Subgrupos na ordem certa — RT-1 (Ímpar Diurno, Par Noturno, Extras Diurno) seguido de RT-2 (só Ímpar Diurno).
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(titulos).toEqual(['Ímpar Diurno', 'Par Noturno', 'Extras Diurno', 'Ímpar Diurno']);

    // Ana (ímpar diurno) aparece só na sua mini-tabela (sem extra); Bruno aparece ali E na tabela de extras (tem uma).
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getAllByText('Bruno')).toHaveLength(2);

    // Extra do Bruno (turno DIURNO, cruzada) aparece como tabela em "Extras Diurno" (não "Extras Noturno"), com "E" no dia 3.
    const extrasDiurno = screen.getByRole('heading', { level: 3, name: 'Extras Diurno' }).closest('div')!;
    expect(extrasDiurno).toHaveTextContent('Bruno');
    // Cabeçalho tem duas linhas agora (letra do dia da semana em cima do número, pedido do usuário) —
    // a linha do número não repete a coluna "Colaborador" (que usa rowSpan), daí o +1 de deslocamento
    // ao indexar a linha do corpo (que tem "Colaborador" como primeira célula).
    const colunaDia3 = within(extrasDiurno).getAllByRole('columnheader').find((th) => th.textContent === '3')!;
    const indiceColuna = [...colunaDia3.parentElement!.children].indexOf(colunaDia3) + 1;
    const linhaBruno = within(extrasDiurno).getByText('Bruno', { exact: false }).closest('tr')!;
    expect(linhaBruno.children[indiceColuna]).toHaveTextContent('E');
  });
});

describe('GradeEscala — colunas alinhadas entre todas as subtabelas (pedido do usuário: "todas as colunas terem o mesmo tamanho")', () => {
  it('a subgrade (Ímpar Diurno) e a tabela de extras (Extras Diurno) da mesma RT usam exatamente a mesma largura de coluna "Colaborador" e de dia', () => {
    const dados: GradeEscalaDados = {
      ciclo: { ano: 2026, mes: 9, dias: 3 },
      codigos: [{ codigo: 'D', descricao: 'Dia trabalhado', cor: '#000', presenca: true, ocupaHorario: true }],
      coberturaPorDia: {},
      colaboradores: [
        {
          id: 'c-impar-diurno',
          nome: 'Ana',
          matricula: '1',
          rt: 'RT-1',
          turnoPadrao: 'DIURNO',
          paridade: 'IMPAR',
          dias: { 1: { escalaDiaId: 'e1', codigo: 'D', turno: 'DIURNO', temExtra: false } },
          extras: [],
          totais: { trabalhados: 1, folgas: 0, extras: 0, horas: 12 },
        },
        {
          id: 'c-par-noturno',
          nome: 'Bruno com um nome bem mais comprido que o da Ana',
          matricula: '2',
          rt: 'RT-1',
          turnoPadrao: 'NOTURNO',
          paridade: 'PAR',
          dias: { 2: { escalaDiaId: 'e2', codigo: 'D', turno: 'NOTURNO', temExtra: true, extraTurno: 'DIURNO', extraRt: 'RT-1' } },
          extras: [{ dia: 2, turno: 'DIURNO', rt: 'RT-1' }],
          totais: { trabalhados: 1, folgas: 0, extras: 1, horas: 24 },
        },
      ],
    };

    render(<GradeEscala cicloId="ciclo-1" dadosIniciais={dados} />);

    const secaoRt1 = screen.getByRole('heading', { level: 2, name: 'RT-1' }).closest('section')!;
    const tabelas = within(secaoRt1).getAllByRole('table');
    // Ímpar Diurno, Par Noturno, Extras Diurno — o nome comprido do Bruno não pode inflar a coluna só na tabela dele.
    expect(tabelas.length).toBeGreaterThanOrEqual(2);

    const largurasColaborador = tabelas.map((tabela) => {
      const col = tabela.querySelector('colgroup col')!;
      return (col as HTMLElement).style.width;
    });
    const largurasDia = tabelas.map((tabela) => {
      const cols = tabela.querySelectorAll('colgroup col');
      return (cols[1] as HTMLElement).style.width;
    });

    expect(new Set(largurasColaborador).size).toBe(1); // mesma largura em todas as tabelas
    expect(new Set(largurasDia).size).toBe(1);
  });
});

describe('GradeEscala — extra cruzada de RT aparece na seção da RT do plantão coberto, não na RT do colaborador (achado em uso real)', () => {
  it('coloca a extra na seção "Extras" da RT-2 quando um colaborador da RT-1 cobre um plantão da RT-2', () => {
    const dados: GradeEscalaDados = {
      ciclo: { ano: 2026, mes: 9, dias: 5 },
      codigos: [
        { codigo: 'D', descricao: 'Dia trabalhado', cor: '#000', presenca: true, ocupaHorario: true },
        { codigo: 'F', descricao: 'Folga', cor: '#111', presenca: false, ocupaHorario: false },
      ],
      coberturaPorDia: {},
      colaboradores: [
        {
          id: 'c-rt1',
          nome: 'Ana',
          matricula: '1',
          rt: 'RT-1',
          turnoPadrao: 'DIURNO',
          paridade: 'IMPAR',
          // Dia 4 NÃO tem célula em `dias` (sem linha de escala_dia pra Ana
          // nesse dia — cenário real: a extra cai no dia de folga dela, que
          // não tem linha nenhuma). Mesmo assim a extra precisa aparecer,
          // daí `extras` ser a fonte usada pelo agrupamento, não `dias`.
          dias: {
            1: { escalaDiaId: 'e1', codigo: 'D', turno: 'DIURNO', temExtra: false },
          },
          extras: [{ dia: 4, turno: 'NOTURNO', rt: 'RT-2' }],
          totais: { trabalhados: 1, folgas: 0, extras: 1, horas: 24 },
        },
        {
          id: 'c-rt2',
          nome: 'Carla',
          matricula: '2',
          rt: 'RT-2',
          turnoPadrao: 'DIURNO',
          paridade: 'IMPAR',
          dias: { 1: { escalaDiaId: 'e3', codigo: 'D', turno: 'DIURNO', temExtra: false } },
          extras: [],
          totais: { trabalhados: 1, folgas: 0, extras: 0, horas: 12 },
        },
      ],
    };

    render(<GradeEscala cicloId="ciclo-1" dadosIniciais={dados} />);

    const secaoRt1 = screen.getByRole('heading', { level: 2, name: 'RT-1' }).closest('section')!;
    const secaoRt2 = screen.getByRole('heading', { level: 2, name: 'RT-2' }).closest('section')!;

    // A extra da Ana aparece na seção da RT-2 (RT do plantão coberto), como tabela com "E" no dia 4...
    expect(secaoRt2).toHaveTextContent(/Extras Noturno/);
    const extrasNoturnoRt2 = within(secaoRt2).getByRole('heading', { level: 3, name: 'Extras Noturno' }).closest('div')!;
    expect(extrasNoturnoRt2).toHaveTextContent('Ana');
    // +1: a linha do número do dia não repete a coluna "Colaborador" (rowSpan) — ver comentário no teste acima.
    const colunaDia4 = within(extrasNoturnoRt2).getAllByRole('columnheader').find((th) => th.textContent === '4')!;
    const indiceColuna = [...colunaDia4.parentElement!.children].indexOf(colunaDia4) + 1;
    const linhaAna = within(extrasNoturnoRt2).getByText('Ana', { exact: false }).closest('tr')!;
    expect(linhaAna.children[indiceColuna]).toHaveTextContent('E');
    // ...e NÃO na seção da RT-1 (RT de origem da Ana).
    expect(secaoRt1).not.toHaveTextContent(/Extras/);
  });
});

describe('GradeEscala — letra do dia da semana em cima do número (pedido do usuário, igual escala real)', () => {
  it('setembro/2026 começa numa terça (T) — a letra aparece na linha de cima do cabeçalho, o número embaixo', () => {
    const dados = construirGrade(1, 3);
    render(<GradeEscala cicloId="ciclo-1" dadosIniciais={dados} />);

    const cabecalhos = screen.getAllByRole('columnheader');
    const diaUm = cabecalhos.find((th) => th.textContent === '1')!;
    const diaDois = cabecalhos.find((th) => th.textContent === '2')!;
    const diaTres = cabecalhos.find((th) => th.textContent === '3')!;
    expect(diaUm).toBeInTheDocument();

    // Linha de letras é a irmã anterior da linha de números, dentro do mesmo <thead>.
    // Índice 0 é a coluna "Colaborador" (rowSpan, só existe na linha de letras) — dias começam no índice 1.
    const linhaLetras = diaUm.parentElement!.previousElementSibling!;
    expect(linhaLetras.children[1]).toHaveTextContent('T'); // 1/set/2026, terça
    expect(linhaLetras.children[2]).toHaveTextContent('Q'); // 2/set/2026, quarta
    expect(linhaLetras.children[3]).toHaveTextContent('Q'); // 3/set/2026, quinta
    void diaDois;
    void diaTres;
  });
});

describe('GradeEscala — FE-6 (navegação por teclado completa)', () => {
  it('move o foco entre células com as setas do teclado', async () => {
    const usuario = userEvent.setup();
    const dados = construirGrade(3, 3);
    render(<GradeEscala cicloId="ciclo-1" dadosIniciais={dados} />);

    const primeiraCelula = screen.getByLabelText('Colaborador 0, dia 1, código F');
    primeiraCelula.focus();
    expect(primeiraCelula).toHaveFocus();

    await usuario.keyboard('{ArrowRight}');
    expect(screen.getByLabelText('Colaborador 0, dia 2, código D')).toHaveFocus();

    await usuario.keyboard('{ArrowDown}');
    expect(screen.getByLabelText('Colaborador 1, dia 2, código D')).toHaveFocus();

    await usuario.keyboard('{ArrowLeft}');
    expect(screen.getByLabelText('Colaborador 1, dia 1, código F')).toHaveFocus();

    await usuario.keyboard('{ArrowUp}');
    expect(screen.getByLabelText('Colaborador 0, dia 1, código F')).toHaveFocus();
  });
});
