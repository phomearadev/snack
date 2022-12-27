import RuntimeCompositedTransport, { AckMessageQueue } from '../RuntimeCompositedTransport';
import type { ListenerType } from '../RuntimeCompositedTransport';
import type { Device } from '../RuntimeTransport';
import RuntimeTransportImplPubNub from '../RuntimeTransportImplPubNub';
import RuntimeTransportImplSocketIO from '../RuntimeTransportImplSocketIO';

jest.mock('../../Logger');
jest.mock('../RuntimeTransportImplPubNub');
jest.mock('../RuntimeTransportImplSocketIO');

describe(RuntimeCompositedTransport, () => {
  const device: Device = {
    id: 'testId',
    name: 'testDeviceName',
    platform: 'ios',
  };

  const mockTransportPrimary = RuntimeTransportImplSocketIO as jest.MockedClass<
    typeof RuntimeTransportImplSocketIO
  >;
  const mockTransportFallback = RuntimeTransportImplPubNub as jest.MockedClass<
    typeof RuntimeTransportImplPubNub
  >;

  afterEach(() => {
    jest.clearAllMocks();
  });

  function setPrimaryTransportConnected(isConnected: boolean) {
    const mockIsConnected = mockTransportPrimary.mock.instances[0]
      .isConnected as jest.MockedFunction<InstanceType<typeof mockTransportPrimary>['isConnected']>;
    mockIsConnected.mockReturnValue(isConnected);
  }

  function emitCallbacks(
    transport: typeof RuntimeTransportImplSocketIO | typeof RuntimeTransportImplPubNub,
    message: object
  ) {
    const mockTransportClass = transport as jest.MockedClass<typeof transport>;
    const mockTransport = mockTransportClass.mock.instances[0];
    const mockListener = mockTransport.listen as jest.MockedFunction<
      InstanceType<typeof mockTransportClass>['listen']
    >;
    const mockListenerCallback = mockListener.mock.calls[0][0];
    mockListenerCallback({ message });
  }

  function waitAsync(timeMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, timeMs);
    });
  }

  it('should subscribe from all transports', () => {
    const transport = new RuntimeCompositedTransport(device);
    transport.subscribe('test');
    expect(mockTransportPrimary.mock.instances[0].subscribe).toBeCalled();
    expect(mockTransportFallback.mock.instances[0].subscribe).toBeCalled();
  });

  it('should unsubscribe from all transports', () => {
    const transport = new RuntimeCompositedTransport(device);
    transport.unsubscribe();
    expect(mockTransportPrimary.mock.instances[0].unsubscribe).toBeCalled();
    expect(mockTransportFallback.mock.instances[0].unsubscribe).toBeCalled();
  });

  it('should publish from primary transport when it is stable', () => {
    const transport = new RuntimeCompositedTransport(device);
    setPrimaryTransportConnected(true);
    transport.publish({ a: 'a' });
    expect(mockTransportPrimary.mock.instances[0].publish).toBeCalled();
    expect(mockTransportFallback.mock.instances[0].publish).not.toBeCalled();
  });

  it('should publish from fallback transport when the primary transport is not connected', () => {
    const transport = new RuntimeCompositedTransport(device);
    setPrimaryTransportConnected(false);
    transport.publish({ a: 'a' });
    expect(mockTransportPrimary.mock.instances[0].publish).not.toBeCalled();
    expect(mockTransportFallback.mock.instances[0].publish).toBeCalled();
  });

  it('should emit upper listener callback only once - primary is connected', async () => {
    const transport = new RuntimeCompositedTransport(device);
    setPrimaryTransportConnected(true);

    const mockUpperListener = jest.fn() as jest.MockedFunction<ListenerType>;
    transport.listen(mockUpperListener);
    emitCallbacks(mockTransportPrimary, { a: 'a' });
    emitCallbacks(mockTransportFallback, { a: 'a' });
    await waitAsync(500);

    expect(mockUpperListener).toBeCalledTimes(1);
    expect(mockUpperListener).toBeCalledWith({ message: { a: 'a' } });
  });

  it('should emit upper listener callback only once - primary is disconnected', async () => {
    const transport = new RuntimeCompositedTransport(device);
    setPrimaryTransportConnected(false);

    const mockUpperListener = jest.fn() as jest.MockedFunction<ListenerType>;
    transport.listen(mockUpperListener);
    emitCallbacks(mockTransportFallback, { a: 'a' });
    await waitAsync(500);

    expect(mockUpperListener).toBeCalledTimes(1);
    expect(mockUpperListener).toBeCalledWith({ message: { a: 'a' } });
  });

  it('should emit upper listener callback only once - primary is too slow', async () => {
    const transport = new RuntimeCompositedTransport(device, 100);
    setPrimaryTransportConnected(true);

    const mockUpperListener = jest.fn() as jest.MockedFunction<ListenerType>;
    transport.listen(mockUpperListener);
    setTimeout(() => {
      emitCallbacks(mockTransportPrimary, { a: 'a' });
    }, 200);
    emitCallbacks(mockTransportFallback, { a: 'a' });
    await waitAsync(500);

    expect(mockUpperListener).toBeCalledTimes(1);
    expect(mockUpperListener).toBeCalledWith({ message: { a: 'a' } });
  });
});

describe(AckMessageQueue, () => {
  it(`findMessageAsync should return false for empty queue`, async () => {
    const queue = new AckMessageQueue(3);
    const result = await queue.findMessageStringAsync(JSON.stringify({}));
    expect(result).toBe(false);
  });

  it(`findMessageAsync should return false when no matching item in queue`, async () => {
    const queue = new AckMessageQueue(3);
    await queue.enqueueMessageStringAsync(JSON.stringify({ '1': '1' }));
    const result = await queue.findMessageStringAsync(JSON.stringify({ '2': '2' }));
    expect(result).toBe(false);
  });

  it(`findMessageAsync should return true when matching item in queue`, async () => {
    const queue = new AckMessageQueue(3);
    await queue.enqueueMessageStringAsync(JSON.stringify({ '1': '1' }));
    const result = await queue.findMessageStringAsync(JSON.stringify({ '1': '1' }));
    expect(result).toBe(true);
  });

  it(`enqueueMessageAsync should remove oldest items and cut the queue size to fit limit`, async () => {
    const queue = new AckMessageQueue(3);
    await queue.enqueueMessageStringAsync(JSON.stringify({ '1': '1' }));
    await queue.enqueueMessageStringAsync(JSON.stringify({ '2': '2' }));
    await queue.enqueueMessageStringAsync(JSON.stringify({ '3': '3' }));
    await queue.enqueueMessageStringAsync(JSON.stringify({ '4': '4' }));
    await queue.enqueueMessageStringAsync(JSON.stringify({ '5': '5' }));

    expect(queue.size()).toBe(3);
    expect(queue.at(0)).toEqual(JSON.stringify({ '5': '5' }));
    expect(queue.at(1)).toEqual(JSON.stringify({ '4': '4' }));
    expect(queue.at(2)).toEqual(JSON.stringify({ '3': '3' }));
  });
});
