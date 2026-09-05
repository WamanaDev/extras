import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EscalaImpressao, type EscalaImpressaoDados } from './EscalaImpressao';

const dados: EscalaImpressaoDados = {
  ciclo: { ano: 2026, mes: 9, dias: 30, competencia: '09/2026' },
  codigos: [
    { codigo: 'D', descricao: 'Dia trabalhado', cor: '#000' },
    { codigo: 'F', descricao: 'Folga', cor: '#0a0' },
  ],
  colaboradores: [
    { id: 'c1', nome: 'Ana', matricula: '1', rt: 'RT-1', turnoPadrao: 'DIURNO', paridade: 'IMPAR', dias: { 1: { codigo: 'D', temExtra: false } }, extras: [] },
    { id: 'c2', nome: 'Beto', matricula: '2', rt: 'RT-1', turnoPadrao: 'NOTURNO', paridade: 'PAR', dias: { 1: { codigo: 'F', temExtra: false } }, extras: [] },
    {
      id: 'c3',
      nome: 'Caio',
      matricula: '3',
      rt: 'RT-2',
      turnoPadrao: 'DIURNO',
      paridade: 'IMPAR',
      dias: { 1: { codigo: 'D', temExtra: false }, 5: { codigo: 'F', temExtra: true, extraTurno: 'NOTURNO', extraRt: 'RT-2' } },
      extras: [{ dia: 5, turno: 'NOTURNO', rt: 'RT-2' }],
    },
  ],
};

describe('EscalaImpressao — FE-7 (A4 paisagem, uma página por RT)', () => {
  it('gera uma página por RT, com quebra de página entre elas (pedido do usuário: cada RT numa folha própria)', () => {
    render(<EscalaImpressao dados={dados} cicloId="ciclo-1" geradoEm={new Date('2026-09-04T12:00:00-03:00')} />);

    expect(screen.getByTestId('pagina-rt-RT-1')).toBeInTheDocument();
    expect(screen.getByTestId('pagina-rt-RT-2')).toBeInTheDocument();
    expect(screen.getAllByText(/^RT /)).toHaveLength(2);

    const raiz = screen.getByTestId('escala-impressao');
    expect(raiz.innerHTML).toMatch(/size:\s*A4 landscape/);
    expect(raiz.innerHTML).toMatch(/break-after:\s*page/);
  });

  it('agrupa por Ímpar/Par × turno, na ordem certa, e lista as extras por turno da extra (não do colaborador)', () => {
    render(<EscalaImpressao dados={dados} cicloId="ciclo-1" geradoEm={new Date('2026-09-04T12:00:00-03:00')} />);

    // RT-1: Ana (ímpar diurno) e Beto (par noturno) em subgrupos separados.
    // RT-2: Caio (Ímpar Diurno) + a tabela "Extras Noturno" (extra dele, cruzada de turno).
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(titulos).toEqual(['Ímpar Diurno', 'Par Noturno', 'Ímpar Diurno', 'Extras Noturno']);

    // Caio (turno base DIURNO) tem uma extra NOTURNA — aparece na tabela "Extras Noturno", não "Extras Diurno".
    expect(screen.getByRole('heading', { level: 3, name: 'Extras Noturno' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Extras Diurno' })).not.toBeInTheDocument();
  });

  it('nunca renderiza `observacao` (SEC-CONF) — o tipo de célula nem admite o campo', () => {
    render(<EscalaImpressao dados={dados} cicloId="ciclo-1" geradoEm={new Date('2026-09-04T12:00:00-03:00')} />);
    expect(screen.queryByText(/observ/i)).not.toBeInTheDocument();
  });

  it('mostra legenda dos códigos e rodapé com data de geração e id do ciclo em CADA página (folha autossuficiente)', () => {
    render(<EscalaImpressao dados={dados} cicloId="ciclo-abc-123" geradoEm={new Date('2026-09-04T12:00:00-03:00')} />);
    expect(screen.getAllByText(/Legenda:/).length).toBe(2); // uma por RT/página
    expect(screen.getAllByText(/ciclo-abc-123/i).length).toBe(2);
  });

  it('mostra a letra do dia da semana em cima do número do dia (pedido do usuário, igual escala real) — 1/set/2026 é terça (T)', () => {
    render(<EscalaImpressao dados={dados} cicloId="ciclo-1" geradoEm={new Date('2026-09-04T12:00:00-03:00')} />);

    const diaUm = screen.getAllByRole('columnheader').find((th) => th.textContent === '1')!;
    const linhaLetras = diaUm.parentElement!.previousElementSibling!;
    // Índice 0 é a coluna "Colaborador" (rowSpan) — o dia 1 é o segundo th da linha de letras.
    expect(linhaLetras.children[1]).toHaveTextContent('T');
  });

  it('todas as tabelas de uma página (base + extras) usam a MESMA largura percentual de coluna (pedido do usuário: "todas as colunas terem o mesmo tamanho")', () => {
    render(<EscalaImpressao dados={dados} cicloId="ciclo-1" geradoEm={new Date('2026-09-04T12:00:00-03:00')} />);

    const paginaRt2 = screen.getByTestId('pagina-rt-RT-2');
    const tabelas = paginaRt2.querySelectorAll('table'); // base (Ímpar Diurno) + Extras Noturno
    expect(tabelas.length).toBeGreaterThanOrEqual(2);

    const largurasColaborador = [...tabelas].map((tabela) => (tabela.querySelector('colgroup col') as HTMLElement).style.width);
    const largurasDia = [...tabelas].map((tabela) => (tabela.querySelectorAll('colgroup col')[1] as HTMLElement).style.width);

    expect(new Set(largurasColaborador).size).toBe(1);
    expect(new Set(largurasDia).size).toBe(1);
  });
});
