import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import type { ComponentsCatalog } from '../types';
import { slugify } from '../utils';

type Props = {
  catalog: ComponentsCatalog;
};

export function CommandSearch({ catalog }: Props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // ⌘K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const allComponents = catalog.categories.flatMap(cat =>
    cat.components.map(comp => ({
      name: comp.name,
      description: comp.shortDescription ?? comp.description,
      slug: slugify(comp.name),
      category: cat.name,
    }))
  );

  const pages = [
    { name: 'Overview', path: '/' },
    { name: 'Tokens', path: '/tokens' },
    { name: 'Components', path: '/components' },
    { name: 'Patterns', path: '/patterns' },
    { name: 'UX Writing', path: '/ux-writing' },
    { name: 'Governance', path: '/governance' },
  ];

  const handleSelect = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-dialog" onClick={e => e.stopPropagation()}>
        <Command>
          <Command.Input placeholder="Search components, tokens, patterns..." autoFocus />
          <Command.List>
            <Command.Empty>No results found.</Command.Empty>

            <Command.Group heading="Pages">
              {pages.map(page => (
                <Command.Item
                  key={page.path}
                  value={page.name}
                  onSelect={() => handleSelect(page.path)}
                >
                  {page.name}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Components">
              {allComponents.map(comp => (
                <Command.Item
                  key={comp.slug}
                  value={`${comp.name} ${comp.description} ${comp.category}`}
                  onSelect={() => handleSelect(`/components/${comp.slug}`)}
                >
                  <div className="cmdk-item-content">
                    <span className="cmdk-item-name">{comp.name}</span>
                    <span className="cmdk-item-desc">{comp.description}</span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
