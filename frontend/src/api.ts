import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || (Constants.expoConfig as any)?.extra?.EXPO_PUBLIC_BACKEND_URL || '';
export const API = `${BACKEND}/api`;

const DEVICE_KEY = 'biterep_device_id';
const USER_KEY = 'biterep_user_id';

export async function getDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_KEY);
}
export async function getUserId(): Promise<string | null> {
  return AsyncStorage.getItem(USER_KEY);
}
export async function saveIds(deviceId: string, userId: string) {
  await AsyncStorage.setItem(DEVICE_KEY, deviceId);
  await AsyncStorage.setItem(USER_KEY, userId);
}
export async function clearIds() {
  await AsyncStorage.removeItem(DEVICE_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}

async function headers() {
  const uid = await getUserId();
  return {
    'Content-Type': 'application/json',
    ...(uid ? { 'X-User-Id': uid } : {}),
  };
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const h = await headers();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...h, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const t = await res.text();
    const err: any = new Error(`${res.status}: ${t}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function authAnon() {
  const deviceId = await getDeviceId();
  const res = await fetch(`${API}/auth/anon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  const j = await res.json();
  await saveIds(j.device_id, j.user_id);
  return j;
}

// Streaming chat: yields text chunks
export async function* buddyStream(text: string) {
  const uid = await getUserId();
  const res = await fetch(`${API}/buddy/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': uid || '' },
    body: JSON.stringify({ text }),
  });
  if (!res.body) {
    const j = await res.text();
    yield j;
    return;
  }
  const reader = (res.body as any).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trimStart();
      if (payload === '[DONE]') return;
      if (payload.startsWith('[ERROR]')) {
        yield `\n\n${payload}`;
        return;
      }
      yield payload;
    }
  }
}
