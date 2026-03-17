import React from 'react';
import { ipcRenderer } from 'electron';
import { App } from './App';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function init(context: any): void {
  const { hooks } = context;

  hooks.addFilter('siteInfoToolsItem', (items: Array<unknown>) => {
    return [
      {
        path: '/cloudflare-pages',
        menuItem: 'Cloudflare Pages',
        render: ({ site }: { site: { id: string } }) => (
          <App siteId={site.id} ipcRenderer={ipcRenderer} />
        ),
      },
      ...items,
    ];
  });
}
