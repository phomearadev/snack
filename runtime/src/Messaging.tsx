// Currently maintains one PubNub subscription for communication with a remote machine

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Device, Transport } from './transports/Transport';

let transport: Transport | null = null;

// Device metadata that is sent with every message from us
const device: Device = {
  id: '', // async, populated in init
  name: Constants.deviceName,
  platform: Platform.OS,
};

export const init = (deviceId: string) => {
  device.id = deviceId;
  const transportClass =
    Platform.OS === 'web'
      ? require('./transports/TransportImplWebPlayer').default
      : require('./transports/TransportImplPubNub').default;
  transport = new transportClass(device);
};

export const unsubscribe = () => {
  if (!transport) {
    throw new Error('Transport does not initialize. Please call `Messaging.init()` first.');
  }
  transport.unsubscribe();
};

export const subscribe = ({ channel }: { channel: string }) => {
  if (!transport) {
    throw new Error('Transport does not initialize. Please call `Messaging.init()` first.');
  }
  transport.subscribe(channel);
};

export const listen = (listener: (payload: { message: object }) => void) => {
  if (!transport) {
    throw new Error('Transport does not initialize. Please call `Messaging.init()` first.');
  }
  transport.listen(listener);
};

export const publish = (message: object) => {
  if (!transport) {
    throw new Error('Transport does not initialize. Please call `Messaging.init()` first.');
  }
  transport.publish(message);
};
