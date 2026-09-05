import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeradorLote } from './GeradorLote';

function mockFetchJson(corpo: unknown, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(corpo),
  } as unknown as Response);
}

describe('GeradorLote', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exige preview antes de habilitar "Gerar plantões"', async () => {
    const usuario = userEvent.setup();
    mockFetchJson({ criados: 0, ignorados: [], preview: [{ data: '2026-09-10', tipo: 'DIURNO', rt: 'RT-1', vagas: 2 }] });

    render(<GeradorLote cicloId="ciclo-1" rts={[{ id: 'rt-1', nome: 'RT-1' }]} />);

    const botaoGerar = screen.getByRole('button', { name: 'Gerar plantões' });
    expect(botaoGerar).toBeDisabled();

    await usuario.click(screen.getByLabelText('RT-1'));
    await usuario.click(screen.getByLabelText('Diurno'));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-30' } });

    await usuario.click(screen.getByRole('button', { name: 'Pré-visualizar' }));

    await waitFor(() => {
      expect(screen.getByTestId('preview-lote')).toHaveTextContent('Serão criados');
    });
    expect(botaoGerar).toBeEnabled();
  });
});
