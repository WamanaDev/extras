/**
 * CSP com nonce (`middleware.ts`/`security-headers.ts`) só funciona em rota
 * renderizada dinamicamente por requisição — senão o HTML (com os `<script>`
 * que o próprio Next injeta) é pré-renderizado em build time, sem nonce
 * correspondente ao CSP da requisição real, e todo script fica bloqueado
 * pra sempre (achado em uso real: `/login` nunca funcionava). `await
 * headers()` no layout raiz força isso pra árvore inteira — este teste só
 * garante que a chamada continua lá (regressão fácil de remover sem notar).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

describe('RootLayout — força renderização dinâmica pra nonce da CSP bater em toda rota', () => {
  it('chama `headers()` (dinamiza a árvore inteira) e ainda renderiza os filhos', async () => {
    headersMock.mockResolvedValue(new Map());

    const RootLayout = (await import('./layout')).default;
    const elemento = await RootLayout({ children: <p>conteúdo</p> });
    // `renderToStaticMarkup` (não jsdom) evita o aviso de nesting inválido de
    // montar <html>/<body> dentro de um container — o layout raiz produz a
    // página inteira, não um fragmento pra encaixar em outro elemento.
    const html = renderToStaticMarkup(elemento);

    expect(headersMock).toHaveBeenCalled();
    expect(html).toContain('conteúdo');
  });
});
