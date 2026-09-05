/**
 * Service worker mínimo de Web Push — preparação de infra (ver
 * `src/server/notificacoes/push.ts`: nenhum push real ainda, faltam as
 * chaves VAPID e os gatilhos de negócio). JS puro, sem bundler — registrado
 * por `src/hooks/usePushNotifications.ts` via `navigator.serviceWorker.register`.
 *
 * `push`: recebe o payload JSON enviado por `webpush.sendNotification`
 * (`{ titulo, mensagem, link }`, ver `PayloadPush` em `push.ts`) e mostra a
 * notificação do sistema.
 *
 * `notificationclick`: fecha a notificação e foca uma aba já aberta na
 * mesma origem (ou abre uma nova) na URL de `event.notification.data.link`,
 * com fallback para `/painel`.
 */
self.addEventListener('push', function (event) {
  var payload = { titulo: 'Notificação', mensagem: '' };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (erro) {
    // Payload não é JSON válido — mostra algo genérico em vez de falhar silenciosamente.
  }

  event.waitUntil(
    self.registration.showNotification(payload.titulo || 'Notificação', {
      body: payload.mensagem || '',
      data: { link: payload.link || '/painel' },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var link = (event.notification.data && event.notification.data.link) || '/painel';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
      return undefined;
    }),
  );
});
