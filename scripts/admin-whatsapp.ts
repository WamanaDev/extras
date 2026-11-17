/**
 * Cadastra/troca o WhatsApp do segundo fator de um admin direto pela
 * service role — para o primeiro acesso depois da troca do MFA por código
 * no WhatsApp (nenhum admin existente tem número ainda, então ninguém
 * consegue entrar no painel para cadastrar pela tela de Administradores).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/admin-whatsapp.ts admin@exemplo.com "(11) 98765-4321"
 *
 * Precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 */
import { createClient } from '@supabase/supabase-js';
import { normalizarWhatsapp } from '../src/server/auth/segundo-fator';

async function main(): Promise<void> {
  const [email, numero] = process.argv.slice(2);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email || !numero) throw new Error('Uso: scripts/admin-whatsapp.ts <email> <whatsapp>');
  if (!url || !chave) throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.');

  const whatsapp = normalizarWhatsapp(numero);
  if (!whatsapp) throw new Error(`WhatsApp inválido: ${numero}`);

  const supabase = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);
  const usuario = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!usuario) throw new Error(`Nenhum usuário com o e-mail ${email}.`);

  const { error: erroAtualizar } = await supabase.auth.admin.updateUserById(usuario.id, { app_metadata: { whatsapp } });
  if (erroAtualizar) throw new Error(erroAtualizar.message);
  // eslint-disable-next-line no-console
  console.log(`WhatsApp de ${email} definido para ${whatsapp}.`);
}

main().catch((erro: unknown) => {
  // eslint-disable-next-line no-console
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
