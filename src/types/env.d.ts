declare namespace NodeJS {
  interface ProcessEnv {
    API_BASE_URL?: string;
    POSTHOG_API_KEY?: string;
    POSTHOG_HOST?: string;
    APP_VERSION?: string;
    APP_BUILD_ID?: string;
    GIT_SHA?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
