# BUG-001 — Detection loss after machine suspend

**Date:** 2026-03-31
**Severity:** Medium
**Status:** Under investigation

## Description

App worked correctly during the day. After suspending the machine (not shutdown), the next day the app failed to detect an active Teams meeting. Restarting the app restored normal behaviour.

## Steps to reproduce

1. Use the app normally — detection working
2. Suspend the machine (lid close or system suspend)
3. Resume the machine the next day
4. Join a Teams meeting
5. App does not detect the call — ON AIR sign stays off

## Expected behaviour

Detection resumes automatically after machine wakes from suspend.

## Actual behaviour

Detection is broken until the app is manually restarted.

## How detection works

`check-mic` (Swift binary) runs as a long-lived child process. It registers CoreAudio property listeners on a specific `AudioDeviceID` captured at startup, and CoreMediaIO listeners per camera device. It emits `in_call` / `not_in_call` to stdout whenever state changes. `main.js` spawns it and reads those events — no polling involved.

There is a restart guard in `main.js`:
```js
detector.on('exit', () => {
  setTimeout(startDetector, 2000);
});
```
But this only helps if the binary exits.

## Root cause hypothesis

After suspend/resume, macOS re-initialises the CoreAudio subsystem. The `AudioDeviceID` registered at startup may become invalid or point to a different device. The CoreAudio property listeners attached to that ID are silently invalidated — no error, no exit. The binary's `RunLoop` keeps running, but no events are ever emitted again.

Since the process doesn't exit, the restart guard in `main.js` never fires.

## Investigation needed

- [ ] Confirm: does `check-mic` stay alive after wake? (`ps aux | grep check-mic`)
- [ ] Confirm: does the default input `AudioDeviceID` change after wake?
- [ ] Check if `AudioObjectAddPropertyListener` silently fails for stale device IDs

## Fix options

**Option A — Kill & restart from Electron on wake (simplest)**
Use Electron's `powerMonitor` API in `main.js`:
```js
const { powerMonitor } = require('electron');
powerMonitor.on('resume', () => {
  detector.kill();
  // detector.on('exit') will restart it automatically after 2s
});
```
No changes to the Swift binary needed.

**Option B — Handle wake inside `check-mic.swift`**
Subscribe to `NSWorkspace.didWakeFromSleepNotification` and re-register all CoreAudio/CoreMediaIO listeners with a fresh `defaultInputDevice()` lookup.

**Recommendation:** Option A — simpler, keeps the Swift binary stateless.

## Workaround

Quit and relaunch the app after waking the machine.
