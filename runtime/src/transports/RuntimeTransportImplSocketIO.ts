import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

import * as Logger from '../Logger';
import type { Device, RuntimeTransport } from './RuntimeTransport';

const SNACKPUB_URL = 'http://snackpub.expo.test:3013';

interface ServerToClientEvents {
  message: (data: { channel: string; message: object; sender: string }) => void;
  joinChannel: (data: { channel: string; sender: string }) => void;
  leaveChannel: (data: { channel: string; sender: string }) => void;
}

interface ClientToServerEvents {
  message: (data: { channel: string; message: object; sender: string }) => void;
  subscribeChannel: (data: { channel: string; sender: string }) => void;
  unsubscribeChannel: (data: { channel: string; sender: string }) => void;
}

export default class RuntimeTransportImplSocketIO implements RuntimeTransport {
  private _currentChannel: string | null = null;
  private readonly _device: Device;
  private readonly _sender: string;
  private readonly _socket: Socket<ServerToClientEvents, ClientToServerEvents>;

  constructor(device: Device) {
    this._device = device;
    this._sender = JSON.stringify(device);
    this._socket = io(SNACKPUB_URL, { transports: ['websocket'] });
  }

  subscribe(channel: string) {
    this.unsubscribe();

    this._currentChannel = channel;
    Logger.comm('Subscribing to channel', channel);
    this._socket.emit('subscribeChannel', { channel, sender: this._sender });
  }

  unsubscribe() {
    if (this._currentChannel) {
      Logger.comm('Unsubscribing from channel', this._currentChannel);
      this._socket.emit('unsubscribeChannel', {
        channel: this._currentChannel,
        sender: this._sender,
      });
      this._currentChannel = null;
    }
  }

  listen(listener: (payload: { message: object }) => void) {
    this._socket.on('message', listener);
  }

  publish(message: object) {
    if (this._currentChannel) {
      Logger.comm('Sending message', message);
      this._socket.emit('message', {
        channel: this._currentChannel,
        message: { ...message, device: this._device },
        sender: this._sender,
      });
    }
  }

  isConnected(): boolean {
    return this._socket.connected;
  }
}
