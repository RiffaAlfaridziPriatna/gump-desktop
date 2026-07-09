import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@gump/auth_token';

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setAuthToken(value: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, value);
}

export async function deleteAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

