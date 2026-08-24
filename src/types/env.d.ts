declare namespace NodeJS {
  interface ProcessEnv {
    API_BASE_URL?: string;
    WEB_APP_URL?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
