import { Platform } from 'react-native';

export interface Device {
  id: string;
  name: string | undefined;
  platform: typeof Platform.OS;
}

/**
 * Interface of the transport for runtime
 */
export interface RuntimeTransport {
  /**
   * Start the transport and subscribe given channel
   */
  subscribe(channel: string): void;

  /**
   * Unsubscribe from the transport
   */
  unsubscribe(): void;

  /**
   * Register listener for the transport
   */
  listen(listener: (payload: { message: object }) => void): void;

  /**
   * Send a message
   */
  publish(message: object): void;

  /**
   * Indicate whether the current transport is connected
   */
  isConnected(): boolean;
}
