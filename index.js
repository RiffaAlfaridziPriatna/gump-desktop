const ReactNative = require('react-native');

function startupLog(message) {
  try {
    if (ReactNative.Platform?.OS === 'windows') {
      ReactNative.NativeModules?.GumpLocalStorage?.appendStartupLog?.(message);
    }
  } catch (_) {
    // Never throw from diagnostics.
  }
}

startupLog('index: enter');

if (ReactNative.Platform?.OS && ReactNative.Platform.OS !== 'windows') {
  require('react-native-gesture-handler');
}

startupLog('index: before di/setup');
require('./src/di/setup');
startupLog('index: after di/setup');

startupLog('index: before App require');
const App = require('./src/app/App').default;
startupLog('index: after App require');

const {name: appName} = require('./app.json');

ReactNative.AppRegistry.registerComponent(appName, () => {
  startupLog('index: AppRegistry factory invoked');
  return App;
});
startupLog('index: registerComponent done');
