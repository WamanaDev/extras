import type { Metadata } from 'next';
import { DocumentoLegal, Secao, Aviso } from '@/components/legal/DocumentoLegal';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Regras de uso do Extrinha para colaboradores e administradores das unidades RT1 e RT2.',
};

export default function TermosDeUsoPage(): JSX.Element {
  return (
    <DocumentoLegal titulo="Termos de Uso" atualizadoEm="5 de setembro de 2026">
      <Aviso>
        <strong>Antes de publicar:</strong> substitua <code>[COMARCA/UF]</code> pela comarca real da
        administração das unidades RT1 e RT2.
      </Aviso>

      <Secao id="aceite" titulo="1. Aceite e a quem se destina">
        <p>
          O Extrinha é uma ferramenta interna disponibilizada a colaboradores e administradores das unidades
          residenciais RT1 e RT2 para gestão da escala 12x36 e de plantões extras. Não é um serviço público nem
          aberto a cadastro externo — o acesso depende de credenciais fornecidas pela administração das unidades.
        </p>
        <p>Ao acessar o sistema com suas credenciais, você concorda com estes termos e com a nossa Política de Privacidade.</p>
      </Secao>

      <Secao id="credenciais" titulo="2. Sua conta e seu PIN">
        <ul className="list-disc space-y-1 pl-5">
          <li>Sua matrícula é cadastrada pela empresa; você não escolhe nem altera esse número.</li>
          <li>Seu PIN é pessoal e intransferível. Ele é o que comprova, na auditoria, que foi você quem marcou ou cancelou um plantão.</li>
          <li>
            <strong>Não compartilhe seu PIN.</strong> Qualquer ação feita com ele é registrada em seu nome, mesmo
            que tenha sido outra pessoa.
          </li>
          <li>Após várias tentativas incorretas seguidas, sua conta é bloqueada temporariamente por segurança.</li>
          <li>Se desconfiar que alguém mais tem acesso à sua conta, avise um administrador imediatamente.</li>
        </ul>
      </Secao>

      <Secao id="uso-permitido" titulo="3. O que você pode fazer no sistema">
        <p>Dentro do seu perfil de colaborador, você pode:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Consultar sua escala e seus plantões extras</li>
          <li>Marcar e cancelar plantões extras disponíveis, respeitando os limites de horas e as regras de jornada configuradas pela empresa</li>
          <li>Acompanhar suas notificações</li>
          <li>Conectar (opcionalmente) sua conta Google para sincronizar sua escala com sua agenda pessoal, e desconectar quando quiser</li>
        </ul>
        <p>
          O sistema aplica automaticamente regras como limite de horas por ciclo, bloqueio de plantão extra
          sobreposto à sua própria escala e impedimento de plantão simultâneo entre as duas unidades. Essas regras
          são definidas pela administração, não pelo sistema por conta própria.
        </p>
      </Secao>

      <Secao id="responsabilidades" titulo="4. Responsabilidades">
        <p>
          A administração é responsável pelas decisões de escala, aprovação de ausências e pelas regras de
          elegibilidade para plantões extras. O sistema registra e aplica o que foi configurado — ele não decide
          por conta própria quem trabalha quando.
        </p>
        <p>
          <strong>O Extrinha não substitui o ponto eletrônico oficial nem a folha de pagamento da empresa.</strong>{' '}
          Ele é uma ferramenta de organização de escala e plantões extras; o registro oficial de jornada e o
          cálculo de remuneração seguem os sistemas e processos de RH da empresa.
        </p>
      </Secao>

      <Secao id="integracoes" titulo="5. Recursos opcionais">
        <p>
          Notificações push e sincronização com Google Calendar são recursos opcionais, desligados por padrão.
          Você decide ativá-los, e pode desativá-los a qualquer momento nas configurações — ao desconectar, os
          dados de acesso relacionados (token, inscrição de notificação) são removidos.
        </p>
      </Secao>

      <Secao id="disponibilidade" titulo="6. Disponibilidade do sistema">
        <p>
          Fazemos o possível para manter o sistema disponível, mas ele pode passar por manutenções programadas ou
          instabilidades pontuais. Não garantimos disponibilidade ininterrupta. Em caso de indisponibilidade, os
          processos de escala e plantão da unidade seguem os procedimentos manuais de contingência da empresa.
        </p>
      </Secao>

      <Secao id="encerramento" titulo="7. Encerramento de acesso">
        <p>
          Seu acesso ao sistema está vinculado ao seu vínculo com a empresa. Ao ser desligado, seu acesso é
          encerrado; os dados relacionados à sua escala e histórico são retidos pelo prazo descrito na Política de
          Privacidade, conforme exigido pela legislação trabalhista.
        </p>
      </Secao>

      <Secao id="propriedade" titulo="8. Propriedade">
        <p>
          O sistema e sua marca (&ldquo;Extrinha&rdquo;) pertencem à administração das unidades RT1 e RT2. Estes
          termos não transferem nenhum direito de propriedade sobre o sistema a você.
        </p>
      </Secao>

      <Secao id="alteracoes" titulo="9. Alterações destes termos">
        <p>
          Podemos atualizar estes termos quando o funcionamento do sistema mudar de forma relevante. A data no
          topo da página indica a versão vigente. Mudanças significativas serão comunicadas por aviso no próprio
          sistema.
        </p>
      </Secao>

      <Secao id="lei-e-foro" titulo="10. Legislação aplicável e foro">
        <p>
          Estes termos são regidos pelas leis brasileiras, incluindo a CLT e a LGPD. Fica eleito o foro da comarca
          de <strong>[COMARCA/UF]</strong> para dirimir eventuais controvérsias, com renúncia a qualquer outro,
          por mais privilegiado que seja.
        </p>
      </Secao>

      <Secao id="contato" titulo="11. Contato">
        <p>
          Dúvidas sobre estes termos: <strong>contato@wamanadev.com.br</strong> ·{' '}
          <strong>(11) 99000-5014</strong>.
        </p>
      </Secao>
    </DocumentoLegal>
  );
}
