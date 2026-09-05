import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorEscalaColaborador } from './EditorEscalaColaborador';
import { previewMeses } from '@/lib/escala/ancora';

describe('EditorEscalaColaborador — FE-4 (preview de 3 meses bate com FN-002)', () => {
  it('o preview mostrado no formulário é idêntico ao que `previewMeses` (fonte usada por FN-002/API-ADM-COL-006) calcularia', () => {
    render(<EditorEscalaColaborador colaboradorId="col-1" />);

    fireEvent.change(screen.getByLabelText(/Âncora/), { target: { value: '2026-09-05' } });
    fireEvent.change(screen.getByLabelText(/Vigência a partir de/), { target: { value: '2026-09-01' } });

    const esperado = previewMeses(new Date('2026-09-05T00:00:00.000Z'), 2, 2026, 9, 3);

    const bloco = screen.getByTestId('preview-3-meses');
    for (const mes of esperado) {
      const rotulo = `${mes.mes.toString().padStart(2, '0')}/${mes.ano}`;
      expect(bloco).toHaveTextContent(rotulo);
      expect(bloco).toHaveTextContent(`${mes.dias.length} dia(s) trabalhado(s)`);
    }
  });

  it('exige o preview preenchido antes de habilitar o salvamento', () => {
    render(<EditorEscalaColaborador colaboradorId="col-1" />);
    expect(screen.getByRole('button', { name: /Salvar troca de escala/ })).toBeDisabled();
  });
});
