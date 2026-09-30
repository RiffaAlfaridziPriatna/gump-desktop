#pragma once

// Synced from VERSION.windows + APP_BUILD_ID by scripts/gump-env.mjs during Windows builds.
#ifndef GUMP_APP_VERSION_STR
#define GUMP_APP_VERSION_STR L"0.0.0.1"
#endif

#ifndef GUMP_APP_BUILD_ID_STR
#define GUMP_APP_BUILD_ID_STR L"local"
#endif

#ifndef GUMP_UPDATES_ENABLED
#define GUMP_UPDATES_ENABLED 0
#endif

#ifndef GUMP_FILE_VERSION
#define GUMP_FILE_VERSION 0,0,0,1
#endif

#ifndef GUMP_FILE_VERSION_STR
#define GUMP_FILE_VERSION_STR "0.0.0.1\0"
#endif
