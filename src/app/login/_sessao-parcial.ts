/**
 * Chave e helpers de acesso ao `tokenParcial` guardado em `sessionStorage`
 * entre `/login` → `/login/pin` | `/login/definir-pin`. Compartilhado pelas
 * três páginas para não divergir o nome da chave nem a forma de ler/limpar.
 *
 * Não é PIN (FE-001.8 proíbe isso) — é um token de escopo `pin-pendente`,
 * uso único, 3 minutos.
 */
export const CHAVE_TOKEN_PARCIAL = 'colaborador.tokenParcial';

export interface TokenParcialGuardado {
  tokenParcial: string;
  expiraEm: string;
}

export function lerTokenParcial(): TokenParcialGuardado | null {
  if (typeof window === 'undefined') return null;
  const bruto = sessionStorage.getItem(CHAVE_TOKEN_PARCIAL);
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto) as Partial<TokenParcialGuardado>;
    if (typeof dados.tokenParcial !== 'string' || typeof dados.expiraEm !== 'string') return null;
    return { tokenParcial: dados.tokenParcial, expiraEm: dados.expiraEm };
  } catch {
    return null;
  }
}

export function limparTokenParcial(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(CHAVE_TOKEN_PARCIAL);
}
