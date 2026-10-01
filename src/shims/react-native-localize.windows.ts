/**
 * react-native-localize has no Windows native module (disabled in
 * react-native.config.js). PostHog optionally requires it; without a shim the
 * real package calls TurboModuleRegistry.getEnforcing('RNLocalize') and the
 * Release app whitescreens.
 *
 * Mirrors react-native-localize/mock with Windows-oriented defaults.
 */
import type {ReactNode} from 'react';

export const getCalendar = () => 'gregorian';

export const getCountry = () => 'US';

export const getCurrencies = () => ['USD'];

export const getLocales = () => [
  {
    countryCode: 'US',
    languageTag: 'en-US',
    languageCode: 'en',
    isRTL: false,
  },
];

export const getNumberFormatSettings = () => ({
  decimalSeparator: '.',
  groupingSeparator: ',',
});

export const getTemperatureUnit = () => 'celsius';

export const getTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const uses24HourClock = () => false;

export const usesMetricSystem = () => true;

export const usesAutoDateAndTime = () => true;

export const usesAutoTimeZone = () => true;

export const findBestLanguageTag = () => ({
  languageTag: 'en-US',
  isRTL: false,
});

export const openAppLanguageSettings = async () => {};

export const ServerLanguagesProvider = ({
  children,
}: {
  children: ReactNode;
  value?: string[];
}) => children;

export const useLocalize = () => ({
  getCalendar,
  getCountry,
  getCurrencies,
  getLocales,
  getNumberFormatSettings,
  getTemperatureUnit,
  getTimeZone,
  uses24HourClock,
  usesMetricSystem,
  usesAutoDateAndTime,
  usesAutoTimeZone,
  findBestLanguageTag,
  openAppLanguageSettings,
});

export default {
  getCalendar,
  getCountry,
  getCurrencies,
  getLocales,
  getNumberFormatSettings,
  getTemperatureUnit,
  getTimeZone,
  uses24HourClock,
  usesMetricSystem,
  usesAutoDateAndTime,
  usesAutoTimeZone,
  findBestLanguageTag,
  openAppLanguageSettings,
  ServerLanguagesProvider,
  useLocalize,
};
