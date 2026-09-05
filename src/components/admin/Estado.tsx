/** Três estados exigidos em toda tela por FE-001.2 — nunca tela branca. */
export function EstadoCarregando({ texto = 'Carregando…' }: { texto?: string }): JSX.Element {
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      {texto}
    </div>
  );
}

/** FE-001.3: `mensagem` sempre vem da API — nunca texto inventado no cliente. */
export function EstadoErro({ mensagem }: { mensagem: string }): JSX.Element {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      {mensagem}
    </div>
  );
}

export function EstadoVazio({ texto }: { texto: string }): JSX.Element {
  return (
    <div role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      {texto}
    </div>
  );
}
