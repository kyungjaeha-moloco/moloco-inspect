import React from 'react';

type Props = {
  url: string;
  children: React.ReactNode;
};

export function BlockBrowser({ url, children }: Props) {
  return (
    <div className="block-browser">
      <div className="block-browser-bar">
        <div className="block-browser-dots">
          <span className="block-browser-dot" style={{ background: '#ff5f57' }} />
          <span className="block-browser-dot" style={{ background: '#febc2e' }} />
          <span className="block-browser-dot" style={{ background: '#28c840' }} />
        </div>
        <div className="block-browser-url">{url}</div>
      </div>
      <div className="block-browser-content">
        {children}
      </div>
    </div>
  );
}
