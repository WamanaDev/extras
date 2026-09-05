import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LinhaDoTempoJornada } from './LinhaDoTempoJornada';

describe('LinhaDoTempoJornada', () => {
  it('destaca a cadeia excedente informada pelo chamador', () => {
    render(
      <LinhaDoTempoJornada
        blocos={[
          { id: 'b1', inicio: '2026-09-02T07:00:00-03:00', fim: '2026-09-02T19:00:00-03:00', origem: 'BASE', rotulo: 'D2 diurno' },
          { id: 'b2', inicio: '2026-09-02T19:00:00-03:00', fim: '2026-09-03T07:00:00-03:00', origem: 'BASE', rotulo: 'D2 noturno' },
          { id: 'b3', inicio: '2026-09-03T07:00:00-03:00', fim: '2026-09-03T19:00:00-03:00', origem: 'PROPOSTO', rotulo: 'D3 diurno (proposto)' },
        ]}
        cadeiaExcedenteIds={['b1', 'b2', 'b3']}
      />,
    );

    expect(screen.getByTestId('bloco-b1')).toHaveAttribute('data-excedente', 'true');
    expect(screen.getByTestId('bloco-b3')).toHaveAttribute('data-excedente', 'true');
  });

  it('exibe estado vazio em vez de tela branca quando não há blocos', () => {
    render(<LinhaDoTempoJornada blocos={[]} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
