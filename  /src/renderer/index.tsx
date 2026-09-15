import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { App } from './App';

// Local by Flywheel injects the current site context into the renderer.
// The add-on renderer is expected to export a default function that Local calls
// with the container element and site context.
declare const localRenderer: {
  addSidebar: (opts: {
    siteId: string;
    title: string;
    render: (container: HTMLElement) => void;
  }) => void;
};

export default function register(): void {
  // `localRenderer` is provided by Local at runtime.
  // We register a sidebar panel that appears per-site.
  localRenderer.addSidebar({
    siteId: '*', // show for all sites
    title: 'Cloudflare Pages',
    render(container: HTMLElement) {
      // Local passes the active site ID via a data attribute on the container
      // or via the site context object. We read it from the container if available.
      const siteId =
        container.dataset.siteId ||
        (window as unknown as { _localSiteId?: string })._localSiteId ||
        '';

      ReactDOM.render(<App siteId={siteId} />, container);
    },
  });
}
