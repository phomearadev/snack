import CompositedTransport from './CompositedTransport';
import ConnectionMetricsEmitter from './ConnectionMetricsEmitter';
import TransportImplPubNub from './TransportImplPubNub';
import { SnackTransport, SnackTransportOptions } from './types';

export * from './types';
export * from './ConnectionMetricsEmitter';
export { ConnectionMetricsEmitter };

export function createTransport(options: SnackTransportOptions): SnackTransport {
  return new TransportImplPubNub(options);
}

export function createSnackPubTransport(options: SnackTransportOptions): SnackTransport {
  return new CompositedTransport(options);
}
