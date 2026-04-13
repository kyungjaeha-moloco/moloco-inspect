import React, { useEffect, useState } from 'react';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { CopyButton } from './CopyButton';

type Props = {
  code: string;
  lang?: string;
};

// Singleton highlighter — created once, reused
let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        import('shiki/themes/github-light.mjs'),
        import('shiki/themes/github-dark.mjs'),
      ],
      langs: [
        import('shiki/langs/tsx.mjs'),
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/jsx.mjs'),
      ],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  }
  return highlighterPromise;
}

function useCurrentTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      setTheme(next);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function CodeBlock({ code, lang = 'tsx' }: Props) {
  const [html, setHtml] = useState<string>('');
  const currentTheme = useCurrentTheme();
  const shikiTheme = currentTheme === 'dark' ? 'github-dark' : 'github-light';

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then(highlighter => {
      if (cancelled) return;
      const result = highlighter.codeToHtml(code, {
        lang,
        theme: shikiTheme,
      });
      setHtml(result);
    });
    return () => { cancelled = true; };
  }, [code, lang, shikiTheme]);

  return (
    <div className="code-block-wrapper" style={{ position: 'relative' }}>
      <CopyButton text={code} />
      {html ? (
        <div
          className="code-block code-block-highlighted"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="code-block"><code>{code}</code></pre>
      )}
    </div>
  );
}
