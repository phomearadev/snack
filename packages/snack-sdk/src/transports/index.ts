import CompositedTransport from './CompositedTransport';
import { SnackTransport, SnackTransportOptions } from './types';

export * from './types';

export function createTransport(options: SnackTransportOptions): SnackTransport {
  return new CompositedTransport(options);
}
