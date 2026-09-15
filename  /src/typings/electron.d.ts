// Type stubs for electron APIs used in this add-on.
// The actual electron module is provided at runtime by Local (WP Engine).
// These stubs satisfy TypeScript without requiring the full electron package.

declare module 'electron' {
  interface IpcMainEvent {
    reply(channel: string, ...args: unknown[]): void;
    sender: {
      send(channel: string, ...args: unknown[]): void;
    };
  }

  interface IpcMain {
    on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): this;
    once(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): this;
    removeListener(channel: string, listener: (...args: unknown[]) => void): this;
    removeAllListeners(channel?: string): this;
    handle(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
  }

  interface IpcRenderer {
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): this;
    once(channel: string, listener: (event: unknown, ...args: unknown[]) => void): this;
    removeListener(channel: string, listener: (...args: unknown[]) => void): this;
    removeAllListeners(channel?: string): this;
    send(channel: string, ...args: unknown[]): void;
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  }

  export const ipcMain: IpcMain;
  export const ipcRenderer: IpcRenderer;
}
