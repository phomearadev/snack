import fs from 'fs';
import { createClient } from 'redis';
import { Server, Socket } from 'socket.io';

import Env from './Env';
import RateLimiter from './RateLimiter';
import { bindRedisAdapterAsync, closeRedisAdapterAsync } from './RedisAdapter';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  ShutdownSignal,
  SocketData,
} from './types';

const debug = require('debug')('snackpub');

function registerShutdownHandlers(
  server: Server,
  redisClient: ReturnType<typeof createClient> | null
) {
  const shutdown = async (signal: ShutdownSignal) => {
    console.log(
      `Received ${signal}; the HTTP server is shutting down and draining existing connections`
    );
    await closeServerAsync(server);
    await closeRedisAdapterAsync();
    await redisClient?.quit();
  };

  // TODO: In Node 9, the signal is passed as the first argument to the listener
  process.once('SIGHUP', () => shutdown('SIGHUP'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  // Nodemon sends SIGUSR2 when it restarts the process it's monitoring
  process.once('SIGUSR2', () => shutdown('SIGUSR2'));
}

function closeServerAsync(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close((error) => {
      if (error) {
        console.log('Failed to close server', error);
      }
      resolve();
    });
  });
}

function terminateSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  reason: string
) {
  socket.emit('terminate', reason);

  // When clients receive the `terminate` message, they should disconnect and no longer try to reconnect back to the server.
  // In case the clients do not handle the `terminate` message, e.g. from other websocket clients other than snackpub clients.
  // We will wait three seconds to close the connections actively.
  setTimeout(() => {
    if (socket.connected) {
      socket.disconnect(true);
    }
  }, 3000);
}

async function runAsync() {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>({
    serveClient: false,
  });

  let redisClient: ReturnType<typeof createClient> | null = null;
  let rateLimiter: RateLimiter | null = null;
  if (Env.redisURL) {
    const redisClientOptions: Parameters<typeof createClient>[0] = {
      url: Env.redisURL,
    };
    if (Env.redisURL.startsWith('rediss:') && Env.redisTlsCa) {
      redisClientOptions.socket = {
        tls: true,
        ca: fs.readFileSync(Env.redisTlsCa),
      };
    }

    redisClient = createClient(redisClientOptions);
    await redisClient.connect();

    await bindRedisAdapterAsync(io, redisClient);
    rateLimiter = new RateLimiter(redisClient);
  }

  io.on('connection', async (socket) => {
    debug('onconnect', socket.handshake.address);
    if (await rateLimiter?.hasExceededSrcIpRateAsync(socket.handshake.address, socket.id)) {
      terminateSocket(socket, 'Too many requests.');
    }

    socket.on('message', async (data) => {
      // debug('onMessage', data);
      if (await rateLimiter?.hasExceededMessagesRateAsync(socket.handshake.address, socket.id)) {
        terminateSocket(socket, 'Too many messages.');
      }

      const { channel, message, sender } = data;
      socket.to(channel).emit('message', { channel, message, sender });
    });

    socket.on('subscribeChannel', async (data) => {
      debug('onSubscribeChannel', data);
      if (await rateLimiter?.hasExceededChannelsRateAsync(socket.handshake.address, socket.id)) {
        terminateSocket(socket, 'Too many channels.');
      }

      const { channel, sender } = data;
      socket.join(channel);
      socket.data.deviceId = sender;
    });

    socket.on('unsubscribeChannel', (data) => {
      debug('onUnsubscribeChannel', data);
      const { channel } = data;
      socket.leave(channel);
    });
  });

  io.of('/').adapter.on('join-room', async (channel: string, id: string) => {
    const sockets = await io.in(channel).fetchSockets();
    const sender = sockets.filter((socket) => socket.id === id)?.[0]?.data?.deviceId;
    if (!sender) {
      return;
    }
    for (const socket of sockets) {
      if (socket.id !== id) {
        debug('joinChannel', { channel, sender });
        socket.emit('joinChannel', { channel, sender });
      }
    }
  });

  io.of('/').adapter.on('leave-room', async (channel: string, id: string) => {
    const sockets = await io.in(channel).fetchSockets();
    const sender = sockets.filter((socket) => socket.id === id)?.[0]?.data?.deviceId;
    if (!sender) {
      return;
    }
    for (const socket of sockets) {
      if (socket.id !== id) {
        debug('leaveChannel', { channel, sender });
        socket.emit('leaveChannel', { channel, sender });
      }
    }
  });

  registerShutdownHandlers(io, redisClient);
  io.listen(Env.port);
}

(async () => {
  try {
    await runAsync();
  } catch (e) {
    console.error('Uncaught Error', e);
    process.exit(1);
  }
})();
