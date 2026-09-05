/**
 * DOM-003 — Testes de `codigos.ts`. A spec `01-dominio/codigos-escala.md` não
 * tem seção "Testes de aceitação" (não é tabela obrigatória por
 * `specs/AGENTS.md` item 6 quando a spec não a define), mas as regras
 * DOM-003.1..6 e a tabela de flags D/F/FT/FE são testadas aqui.
 */
import { describe, expect, it } from 'vitest';
import {
  CODIGOS_BASE,
  consomeCotaDeExtras,
  contaCobertura,
  contaComoDescanso,
  exigeConfirmacaoAoAlterar,
  podeAlterarFlags,
  podeDesativar,
  podeExcluir,
  podeLancarOuAlterarAusencia,
} from './codigos';

function porCodigo(codigo: string) {
  const encontrado = CODIGOS_BASE.find((c) => c.codigo === codigo);
  if (!encontrado) throw new Error(`código ${codigo} não está no seed base`);
  return encontrado;
}

describe('DOM-003 tabela de referência D/F/FT/FE', () => {
  it('D: presenca=true, ocupaHorario=true', () => {
    const d = porCodigo('D');
    expect(d.presenca).toBe(true);
    expect(d.ocupaHorario).toBe(true);
    expect(d.remunerada).toBe(true);
  });

  it('F: presenca=false, ocupaHorario=false', () => {
    const f = porCodigo('F');
    expect(f.presenca).toBe(false);
    expect(f.ocupaHorario).toBe(false);
  });

  it('FT: presenca=false, ocupaHorario=true, remunerada=true', () => {
    const ft = porCodigo('FT');
    expect(ft.presenca).toBe(false);
    expect(ft.ocupaHorario).toBe(true);
    expect(ft.remunerada).toBe(true);
  });

  it('FE: presenca=false, ocupaHorario=true, remunerada=true, descrição "Férias"', () => {
    const fe = porCodigo('FE');
    expect(fe.presenca).toBe(false);
    expect(fe.ocupaHorario).toBe(true);
    expect(fe.remunerada).toBe(true);
    expect(fe.descricao).toBe('Férias');
  });
});

describe('DOM-003.6 revisado (pedido do usuário): fixo/bloqueado é D, F e FE — FT deixou de ser especial', () => {
  it('D, F e FE nascem bloqueados; FT não', () => {
    expect(porCodigo('D').bloqueado).toBe(true);
    expect(porCodigo('F').bloqueado).toBe(true);
    expect(porCodigo('FE').bloqueado).toBe(true);
    expect(porCodigo('FT').bloqueado).toBe(false);
  });
});

describe('DOM-003 distinção presenca vs ocupaHorario', () => {
  it('contaCobertura usa presenca, contaComoDescanso usa ocupaHorario — não são a mesma pergunta', () => {
    const ft = porCodigo('FT');
    expect(contaCobertura(ft)).toBe(false); // não cobre o plantão
    expect(contaComoDescanso(ft)).toBe(false); // também não está descansando
  });

  it('D cobre e não descansa; F não cobre e descansa', () => {
    const d = porCodigo('D');
    const f = porCodigo('F');
    expect(contaCobertura(d)).toBe(true);
    expect(contaComoDescanso(d)).toBe(false);
    expect(contaCobertura(f)).toBe(false);
    expect(contaComoDescanso(f)).toBe(true);
  });
});

describe('DOM-003 regras DOM-003.1..6', () => {
  it('DOM-003.1: só admin lança/altera ausência', () => {
    expect(podeLancarOuAlterarAusencia(true)).toBe(true);
    expect(podeLancarOuAlterarAusencia(false)).toBe(false);
  });

  it('DOM-003.2: ausência nunca consome cota de extras', () => {
    expect(consomeCotaDeExtras()).toBe(false);
  });

  it('DOM-003.3: alterar ausência com extra marcada exige confirmação', () => {
    expect(exigeConfirmacaoAoAlterar(true)).toBe(true);
    expect(exigeConfirmacaoAoAlterar(false)).toBe(false);
  });

  it('DOM-003.5: código em uso não pode ser excluído, só desativado', () => {
    expect(podeExcluir(true)).toBe(false);
    expect(podeExcluir(false)).toBe(true);
  });

  it('DOM-003.6 (revisado): código bloqueado (D/F/FE) não desativa, não altera flags; FT (não bloqueado) pode', () => {
    expect(podeAlterarFlags({ bloqueado: true })).toBe(false);
    expect(podeDesativar({ bloqueado: true })).toBe(false);
    expect(podeAlterarFlags(porCodigo('FT'))).toBe(true);
    expect(podeDesativar(porCodigo('FT'))).toBe(true);
    expect(podeAlterarFlags(porCodigo('FE'))).toBe(false);
    expect(podeDesativar(porCodigo('FE'))).toBe(false);
  });
});
