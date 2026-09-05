/**
 * `/admin/configuracoes` — FE-001 ("RTs, códigos, admins").
 *
 * Só a seção de códigos de escala tem CRUD real agora (`<CodigosEscala />`,
 * `/api/admin/codigos-escala`, pedido do usuário: "implementar configuração
 * de motivo de ausência de forma dinâmica"). RT e administradores continuam
 * sem rota dedicada — ver aviso abaixo, mantido do estado anterior desta
 * tela (`_conflitos.md`).
 */
import { CodigosEscala } from '@/components/admin/CodigosEscala';

export default function ConfiguracoesPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Configurações</h1>

      <CodigosEscala />

      <section role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">RTs e administradores ainda não têm uma API dedicada.</p>
        <p className="mt-2">
          O mapa de páginas lista <code>RTs, códigos, admins</code> para <code>/admin/configuracoes</code> — códigos de escala (acima) já têm CRUD
          completo, mas nenhuma rota de <code>04-api/*</code> expõe CRUD para RT (unidade residencial) ou contas de administrador — só leitura
          implícita dentro de outras rotas (ex.: RT dentro de <code>POST /api/admin/colaboradores/importar</code>). Administradores são contas do
          Supabase Auth, sem tabela própria no Prisma.
        </p>
        <p className="mt-2">
          Implementar essas duas partes exigiria criar rotas de API novas. Registrado como pendência em <code>_conflitos.md</code>.
        </p>
      </section>
    </div>
  );
}
