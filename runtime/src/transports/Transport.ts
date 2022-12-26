import { Platform } from 'react-native';

export interface Device {
  id: string;
  name: string | undefined;
  platform: typeof Platform.OS;
}

export interface Transport {
  subscribe(channel: string): void;
  unsubscribe(): void;
  listen(listener: (payload: { message: object }) => void): void;
  publish(message: object): void;
}
