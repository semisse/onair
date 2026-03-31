const { OnAirState } = require('../src/state');

function makeState() {
  const signals = [];
  const state = new OnAirState({ onSignal: (v) => signals.push(v) });
  return { state, signals };
}

describe('OnAirState — auto mode', () => {
  test('mic/camera active emits ON', () => {
    const { state, signals } = makeState();
    state.onDetectorEvent('in_call');
    expect(signals).toEqual([true]);
  });

  test('mic/camera inactive emits OFF', () => {
    const { state, signals } = makeState();
    state.onDetectorEvent('in_call');
    state.onDetectorEvent('not_in_call');
    expect(signals).toEqual([true, false]);
  });

  test('duplicate state does not re-emit', () => {
    const { state, signals } = makeState();
    state.onDetectorEvent('in_call');
    state.onDetectorEvent('in_call');
    expect(signals).toEqual([true]);
  });
});

describe('OnAirState — manual override', () => {
  test('force ON ignores detector OFF', () => {
    const { state, signals } = makeState();
    state.setOverride(true);
    state.onDetectorEvent('not_in_call');
    expect(signals).toEqual([true]);
  });

  test('force OFF while detector is active', () => {
    const { state, signals } = makeState();
    state.onDetectorEvent('in_call');
    state.setOverride(false);
    expect(signals).toEqual([true, false]);
  });

  test('returning to auto applies current detector state', () => {
    const { state, signals } = makeState();
    state.setOverride(true);
    state.onDetectorEvent('not_in_call'); // ignored — override active
    state.setOverride(null);              // back to auto → detectorState is false
    expect(signals).toEqual([true, false]);
  });

  test('returning to auto while detector is active keeps ON', () => {
    const { state, signals } = makeState();
    state.onDetectorEvent('in_call');
    state.setOverride(false);  // force off
    state.setOverride(null);   // back to auto → detectorState is still true
    expect(signals).toEqual([true, false, true]);
  });

  test('returning to auto after force-off emits OFF even if state unchanged', () => {
    // Bug: setOverride(null) was skipping onSignal when detectorState === lastState,
    // leaving the tray stuck on the override icon instead of the auto icon.
    const { state, signals } = makeState();
    state.setOverride(true);   // force on  → emits true
    state.setOverride(false);  // force off → emits false
    state.setOverride(null);   // back to auto, detectorState=false → must still emit false
    expect(signals).toEqual([true, false, false]);
  });
});
