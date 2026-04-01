/**
 * Handle a line emitted by the ble-bridge process.
 * Re-sends the current state when the device reconnects.
 *
 * @param {string}   line       - stdout line from ble-bridge ('connected' | 'disconnected')
 * @param {boolean|null} lastState - last known signal state (true=busy, false=free, null=unknown)
 * @param {function} sendSignal - callback to send state to the device
 */
function onBleEvent(line, lastState, sendSignal) {
  if (line === 'connected') {
    sendSignal(lastState ?? false);
  }
}

module.exports = { onBleEvent };
