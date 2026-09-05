/** Fallback de carregamento do grupo (FE-001.2) enquanto o guard/dados da página resolvem no servidor. */
export default function CarregandoColaborador(): JSX.Element {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-600">
      Carregando…
    </div>
  );
}
