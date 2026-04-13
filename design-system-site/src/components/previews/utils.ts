import React from 'react';

export function handleKeyActivate(callback: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      callback();
    }
  };
}
