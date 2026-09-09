/**
 * `/admin/configuracoes` — FE-001 ("RTs, códigos, admins").
 *
 * Códigos de escala tem CRUD real (`<CodigosEscala />`, `/api/admin/codigos-escala`).
 * Administradores ganharam tela própria (`/admin/administradores`, pedido do
 * usuário — "aba pra convidar novos administradores"), então saiu do aviso
 * de pendência abaixo. RT (unidade residencial) continua sem rota dedicada.
 */
import { CodigosEscala } from '@/components/admin/CodigosEscala';

export default function ConfiguracoesPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Configurações</h1>

      <CodigosEscala />

      <section role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">RT (unidade residencial) ainda não tem uma API dedicada.</p>
        <p className="mt-2">
          Códigos de escala (acima) já têm CRUD completo, e administradores agora têm tela própria (
          <code>/admin/administradores</code>). Só RT segue sem rota de <code>04-api/*</code> — só leitura implícita
          dentro de outras rotas (ex.: dentro de <code>POST /api/admin/colaboradores/importar</code>).
        </p>
        <p className="mt-2">
          Implementar isso exigiria criar rotas de API novas. Registrado como pendência em <code>_conflitos.md</code>.
        </p>
      </section>
    </div>
  );
}
