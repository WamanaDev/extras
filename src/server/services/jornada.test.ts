/**
 * DOM-002 — Testes de `jornada.ts` (orquestração: janela + carregamento +
 * delegação a `validaDescanso`). Não há tabela própria de "Testes de
 * aceitação" para este arquivo na spec — a tabela de `blocos-jornada.md` cobre
 * `validaDescanso`; aqui cobrimos o contrato de orquestração em torno dela.
 */
import { describe, expect, it } from 'vitest';
import { blocoDoTurno, type Bloco } from '@/lib/escala/blocos';
import { calculaJanela, validaJornada, type CarregarBlocosOcupados } from './jornada';

function dia(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 1 + offset));
}

describe('DOM-002 calculaJanela', () => {
  it('janela derivada = (maxBlocos + 1) * 12h para cada lado', () => {
    const novo = blocoDoTurno(dia(1), 'NOTURNO');
    const janela = calculaJanela(novo, 2);
    const horasEsperadas = 3 * 12; // (2 + 1) * 12h
    expect(+novo.inicio - +janela.de).toBe(horasEsperadas * 60 * 60 * 1000);
    expect(+janela.ate - +novo.fim).toBe(horasEsperadas * 60 * 60 * 1000);
  });

  it('janela acompanha maxBlocos = 3 (48h de cada lado)', () => {
    const novo = blocoDoTurno(dia(1), 'DIURNO');
    const janela = calculaJanela(novo, 3);
    expect(+novo.inicio - +janela.de).toBe(48 * 60 * 60 * 1000);
  });
});

describe('DOM-002 validaJornada — orquestração', () => {
  it('carrega a janela certa, ordena os blocos e delega a validaDescanso', async () => {
    const baseNoturnoD2 = blocoDoTurno(dia(1), 'NOTURNO');
    const extraDiurnoD2 = blocoDoTurno(dia(1), 'DIURNO');
    const novo = blocoDoTurno(dia(2), 'DIURNO'); // D3 diurno

    let chamadaColaborador = '';
    let chamadaJanela: { de: Date; ate: Date } | null = null;
    const carregar: CarregarBlocosOcupados = async (colaboradorId, janela) => {
      chamadaColaborador = colaboradorId;
      chamadaJanela = janela;
      // devolve fora de ordem de propósito — validaJornada deve reordenar.
      return [extraDiurnoD2, baseNoturnoD2];
    };

    const resultado = await validaJornada(carregar, 'colab-1', novo, 2);

    expect(resultado).toBe('EXCEDE_JORNADA');
    expect(chamadaColaborador).toBe('colab-1');
    expect(chamadaJanela).not.toBeNull();
    expect(+chamadaJanela!.de).toBeLessThan(+novo.inicio);
    expect(+chamadaJanela!.ate).toBeGreaterThan(+novo.fim);
  });

  it('sem blocos ocupados, novo bloco é sempre liberado', async () => {
    const novo = blocoDoTurno(dia(0), 'DIURNO');
    const carregar: CarregarBlocosOcupados = async () => [] as Bloco[];
    expect(await validaJornada(carregar, 'colab-2', novo, 2)).toBeNull();
  });

  it('conflito de horário é detectado após o carregamento', async () => {
    const baseNoturnoD2 = blocoDoTurno(dia(1), 'NOTURNO');
    const extraNoturnoD2 = blocoDoTurno(dia(1), 'NOTURNO');
    const carregar: CarregarBlocosOcupados = async () => [baseNoturnoD2];
    expect(await validaJornada(carregar, 'colab-3', extraNoturnoD2, 2)).toBe('CONFLITO_DE_HORARIO');
  });
});
