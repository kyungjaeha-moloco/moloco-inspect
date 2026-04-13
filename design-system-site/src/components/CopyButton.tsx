import React, { useState } from 'react';

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <button
      className={`copy-btn ${className ?? ''}${copied ? ' copied' : ''}`}
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  );
}
