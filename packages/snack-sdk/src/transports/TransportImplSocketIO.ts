import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

import ConnectionMetricsEmitter from './ConnectionMetricsEmitter';
import { ProtocolOutgoingMessage, ProtocolIncomingMessage, ProtocolCodeMessage } from './Protocol';
import TransportImplBase from './TransportImplBase';
import type { SnackTransportOptions } from './types';

interface ServerToClientEvents {
  message: (data: { channel: string; message: ProtocolIncomingMessage; sender: string }) => void;
  joinChannel: (data: { channel: string; sender: string }) => void;
  leaveChannel: (data: { channel: string; sender: string }) => void;
  terminate: (reason: string) => void;
}

interface ClientToServerEvents {
  message: (data: { channel: string; message: ProtocolOutgoingMessage; sender: string }) => void;
  subscribeChannel: (data: { channel: string; sender: string }) => void;
  unsubscribeChannel: (data: { channel: string; sender: string }) => void;
}

export default class TransportImplSocketIO extends TransportImplBase {
  private readonly _snackpubURL: string;
  private _socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private _startTime: number | undefined;
  private _connectionAttempts: number;

  constructor(options: SnackTransportOptions) {
    super(options);
    const { snackpubURL } = options;
    if (!snackpubURL) {
      throw new Error('The `snackpubURL` option is unspecified.');
    }
    this._snackpubURL = snackpubURL;
    this._connectionAttempts = 0;
  }

  protected start(): void {
    this.stop();
    this._startTime = Date.now();

    this._socket = io(this._snackpubURL, { transports: ['websocket'] });

    this._socket.on('connect', () => {
      this._socket?.emit('subscribeChannel', { channel: this.channel, sender: this._socket?.id });
      if (this._startTime) {
        ConnectionMetricsEmitter.emitSuccessed({
          timeMs: Date.now() - this._startTime,
          attempts: this._connectionAttempts,
        });
      }
    });
    this._socket.io.on('reconnect_attempt', (attempts: number) => {
      this._connectionAttempts = attempts;
      if (this._startTime) {
        ConnectionMetricsEmitter.emitFailed({
          timeMs: Date.now() - this._startTime,
          attempts,
        });
      }
    });

    this._socket.on('message', this.onMessage);
    this._socket.on('joinChannel', this.onJoinChannel);
    this._socket.on('leaveChannel', this.onLeaveChannel);
    this._socket.on('terminate', (reason) => {
      this.logger?.comm(`Terminating connection: ${reason}`);
      this._socket?.disconnect();
    });
  }

  protected stop(): void {
    if (this._socket != null) {
      this.logger?.comm('Stopping...', this.logSuffix);

      this._socket.offAny();
      this._socket.close();
      this._socket = null;
    }
    this._startTime = undefined;
  }

  protected isStarted(): boolean {
    return this._socket != null;
  }

  protected sendAsync(channel: string, message: ProtocolOutgoingMessage): Promise<void> {
    this._socket?.emit('message', {
      channel,
      message,
      sender: this._socket.id,
    });
    return Promise.resolve();
  }

  protected onVerifyCodeMessageSize(codeMessage: ProtocolCodeMessage): boolean {
    // https://socket.io/docs/v4/server-options/#maxhttpbuffersize
    const MAX_SIZE = 1e6;

    // Calculate unencoded size (quickly) and if that exceeds the limit
    // then don't bother calculating the exact size (which is more expensive)
    let approxSize = 0;
    for (const path in codeMessage.diff) {
      approxSize += path.length + codeMessage.diff[path].length;
    }
    return approxSize < MAX_SIZE;
  }

  private onMessage = (data: {
    channel: string;
    message: ProtocolIncomingMessage;
    sender: string;
  }) => {
    const { sender, message } = data;
    this.handleMessage(sender, message);
  };

  private onJoinChannel = (data: { channel: string; sender: string }) => {
    const { sender } = data;
    if (sender !== '' && sender !== this._socket?.id) {
      this.handleChannelEvent('join', sender);
    }
  };

  private onLeaveChannel = (data: { channel: string; sender: string }) => {
    const { sender } = data;
    if (sender !== '' && sender !== this._socket?.id) {
      this.handleChannelEvent('leave', sender);
    }
  };
}
