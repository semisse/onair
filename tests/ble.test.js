const { onBleEvent } = require('../src/ble');

describe('onBleEvent', () => {
  test('re-sends current state (true) on connected', () => {
    const sendSignal = jest.fn();
    onBleEvent('connected', true, sendSignal);
    expect(sendSignal).toHaveBeenCalledWith(true);
  });

  test('re-sends current state (false) on connected', () => {
    const sendSignal = jest.fn();
    onBleEvent('connected', false, sendSignal);
    expect(sendSignal).toHaveBeenCalledWith(false);
  });

  test('defaults to false when lastState is null on connected', () => {
    const sendSignal = jest.fn();
    onBleEvent('connected', null, sendSignal);
    expect(sendSignal).toHaveBeenCalledWith(false);
  });

  test('does nothing on disconnected', () => {
    const sendSignal = jest.fn();
    onBleEvent('disconnected', true, sendSignal);
    expect(sendSignal).not.toHaveBeenCalled();
  });

  test('does nothing on unknown events', () => {
    const sendSignal = jest.fn();
    onBleEvent('unexpected', true, sendSignal);
    expect(sendSignal).not.toHaveBeenCalled();
  });
});
