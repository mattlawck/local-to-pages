export interface SiteConfig {
  cfApiToken: string;
  cfAccountId: string;
  cfProjectName: string;
  publicUrl: string;
  staticOutputDir: string;
  customRedirects: string;
}

export type DeployStep =
  | 'idle'
  | 'exporting'
  | 'generating-llms'
  | 'hardening'
  | 'deploying'
  | 'done'
  | 'error';

export interface DeployState {
  step: DeployStep;
  logs: string[];
  pagesUrl?: string;
  error?: string;
}

export interface LogEvent {
  siteId: string;
  message: string;
}

export interface StepEvent {
  siteId: string;
  step: DeployStep;
}

export interface DoneEvent {
  siteId: string;
  pagesUrl: string;
}

export interface ErrorEvent {
  siteId: string;
  error: string;
}

export const IPC = {
  // renderer → main
  START_DEPLOY: 'local-to-pages:start-deploy',
  GET_CONFIG: 'local-to-pages:get-config',
  SAVE_CONFIG: 'local-to-pages:save-config',

  // main → renderer
  LOG: 'local-to-pages:log',
  STEP: 'local-to-pages:step',
  DONE: 'local-to-pages:done',
  ERROR: 'local-to-pages:error',
  CONFIG_DATA: 'local-to-pages:config-data',
  SITE_NOT_RUNNING: 'local-to-pages:site-not-running',
} as const;
