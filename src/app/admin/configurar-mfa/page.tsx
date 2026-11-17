/**
 * `/admin/configurar-mfa` — tela antiga de cadastro do app autenticador
 * (TOTP). O segundo fator agora é um código pelo WhatsApp
 * (`src/server/auth/segundo-fator.ts`), sem cadastro pelo próprio usuário —
 * a rota fica só para links antigos não quebrarem.
 */
import { redirect } from 'next/navigation';

export default function ConfigurarMfaPage(): never {
  redirect('/admin/verificar');
}
