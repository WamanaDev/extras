/**
 * `POST /api/auth/admin/codigo/enviar` — (re)envia o código de login pelo
 * WhatsApp para a sessão do Supabase já aberta pela etapa de senha.
 *
 * Usado pelo botão "Reenviar código" e por `/admin/verificar` (quem chega
 * com sessão de senha mas sem segundo fator — ex.: logo após definir a
 * senha do convite, ou depois que o `admin_2fa` de 4h expira).
 *
 * `ator: 'PUBLICO'` porque, por definição, a sessão ainda não é de admin
 * completo; a rota exige a sessão do Supabase por conta própria.
 */
import { defineHandler } from '@/server/http/handler';
import { erroLimiteExcedido, erroNaoAutenticado, erroWhatsappNaoCadastrado } from '@/server/http/erros';
import { verificarRateLimit } from '@/server/http/rate-limit';
import { obterEstadoSessaoAdmin } from '@/server/auth/sessao-admin';
import { enviarCodigoAdmin } from '@/server/auth/enviar-codigo-admin';
import { mascararWhatsapp } from '@/server/auth/segundo-fator';

export const POST = defineHandler({
  ator: 'PUBLICO',
  rateLimit: { escopo: 'login_admin_ip' },
  cache: 'mutacao',
  handler: async () => {
    const sessao = await obterEstadoSessaoAdmin();
    if (sessao.estado === 'SEM_SESSAO') throw erroNaoAutenticado();
    if (sessao.estado === 'VERIFICADA') return { jaVerificado: true };

    const { usuario } = sessao;
    if (!usuario.whatsapp) throw erroWhatsappNaoCadastrado();

    // Mesmo balde/limite do login por e-mail (5 / 15 min), chave própria por usuário.
    const limite = await verificarRateLimit('login_admin_email', `codigo:${usuario.id}`);
    if (!limite.permitido) throw erroLimiteExcedido(limite.retryAfter);

    await enviarCodigoAdmin({ userId: usuario.id, sessionId: usuario.sessionId, whatsapp: usuario.whatsapp });
    return { precisaCodigo: true, destino: mascararWhatsapp(usuario.whatsapp) };
  },
});
