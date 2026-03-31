/**
 * OnAirState — pure state machine, no Electron dependencies.
 *
 * onSignal(bool) is called whenever the ON/OFF state changes.
 */
class OnAirState {
  constructor({ onSignal }) {
    this.lastState    = null;
    this.manualOverride = null; // null = auto | true = forced on | false = forced off
    this.detectorState  = false;
    this.onSignal       = onSignal;
  }

  // Apply a new state, emitting only when it actually changes.
  apply(inCall) {
    if (inCall !== this.lastState) {
      this.lastState = inCall;
      this.onSignal(inCall);
    }
  }

  // Called for each line emitted by the native detector process.
  onDetectorEvent(line) {
    this.detectorState = line === 'in_call';
    if (this.manualOverride === null) this.apply(this.detectorState);
  }

  // null = return to auto, true/false = force on/off.
  setOverride(value) {
    this.manualOverride = value;
    if (value === null) this.lastState = null; // force re-emit so tray updates on return to auto
    this.apply(value === null ? this.detectorState : value);
  }
}

module.exports = { OnAirState };
