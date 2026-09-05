/**
 * API-AUTH-003 — RN-30: força do PIN.
 *
 * Função pura, sem I/O — testável sem banco. Usada por
 * `POST /api/auth/colaborador/definir-pin`.
 *
 * PIN rejeitado (`PIN_FRACO`) se: sequência crescente/decrescente (`1234`,
 * `4321`), todos os dígitos iguais (`1111`), igual à matrícula do
 * colaborador, ou está entre os 20 mais comuns.
 */

/**
 * 20 PINs mais comuns (subconjunto padrão de estudos de PIN de 4 dígitos,
 * como o dataset amplamente citado de "PIN mais fracos"). `1234`/`4321`/`1111`
 * também caem aqui, mas já são cobertos por `ehSequencial`/`ehRepetido`
 * primeiro — mantidos na lista só por completude/clareza do motivo.
 */
const PINS_COMUNS = [
  '1234', '1111', '0000', '1212', '7777', '1004', '2000', '4444', '2222', '6969',
  '9999', '3333', '5555', '6666', '1122', '1313', '8888', '4321', '2001', '1010',
];

export type MotivoPinFraco = 'SEQUENCIA' | 'REPETIDO' | 'IGUAL_MATRICULA' | 'COMUM';

function ehSequencial(digitos: number[]): boolean {
  if (digitos.length < 2) return false;
  let crescente = true;
  let decrescente = true;
  for (let i = 1; i < digitos.length; i++) {
    const atual = digitos[i]!;
    const anterior = digitos[i - 1]!;
    if (atual !== anterior + 1) crescente = false;
    if (atual !== anterior - 1) decrescente = false;
  }
  return crescente || decrescente;
}

function ehRepetido(digitos: number[]): boolean {
  return new Set(digitos).size === 1;
}

/**
 * `pin`: só dígitos, 4–6 chars (a forma já foi validada pelo schema Zod da
 * rota antes de chegar aqui). `matricula`: `colaborador.matricula` — comparação
 * direta com o PIN escolhido, para recusar o caso óbvio de o colaborador usar
 * sua própria matrícula como PIN.
 */
export function validarForcaPin(pin: string, matricula: string): MotivoPinFraco | null {
  const digitos = pin.split('').map(Number);

  if (ehSequencial(digitos)) return 'SEQUENCIA';
  if (ehRepetido(digitos)) return 'REPETIDO';

  if (pin === matricula) return 'IGUAL_MATRICULA';

  if (PINS_COMUNS.includes(pin)) return 'COMUM';

  return null;
}
