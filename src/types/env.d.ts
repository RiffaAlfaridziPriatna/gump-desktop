declare namespace NodeJS {
  interface ProcessEnv {
    API_BASE_URL?: string;
    POSTHOG_API_KEY?: string;
    POSTHOG_HOST?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
