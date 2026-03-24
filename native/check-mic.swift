import CoreAudio
import AppKit

// Global state — accessible from C-style CoreAudio callback (no captures allowed)
var gTeamsRunning = false
var gMicInUse     = false
var gDeviceID     = AudioDeviceID(kAudioObjectUnknown)

func emit() {
    print(gTeamsRunning && gMicInUse ? "in_call" : "not_in_call")
    fflush(stdout)
}

// MARK: - CoreAudio helpers

func defaultInputDevice() -> AudioDeviceID {
    var id   = AudioDeviceID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope:    kAudioObjectPropertyScopeGlobal,
        mElement:  kAudioObjectPropertyElementMain)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),
                               &addr, 0, nil, &size, &id)
    return id
}

func readMicInUse(deviceID: AudioDeviceID) -> Bool {
    var value: UInt32 = 0
    var size  = UInt32(MemoryLayout<UInt32>.size)
    var addr  = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
        mScope:    kAudioObjectPropertyScopeGlobal,
        mElement:  kAudioObjectPropertyElementMain)
    AudioObjectGetPropertyData(deviceID, &addr, 0, nil, &size, &value)
    return value > 0
}

// MARK: - Teams detection

func isTeams(_ app: NSRunningApplication) -> Bool {
    app.bundleIdentifier == "com.microsoft.teams2" ||
    app.bundleIdentifier == "com.microsoft.teams"  ||
    app.executableURL?.lastPathComponent == "MSTeams"
}

// MARK: - Initial state

gDeviceID     = defaultInputDevice()
gMicInUse     = readMicInUse(deviceID: gDeviceID)
gTeamsRunning = NSWorkspace.shared.runningApplications.contains { isTeams($0) }

// MARK: - CoreAudio listener (C callback — no variable captures)

var micAddr = AudioObjectPropertyAddress(
    mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
    mScope:    kAudioObjectPropertyScopeGlobal,
    mElement:  kAudioObjectPropertyElementMain)

AudioObjectAddPropertyListener(gDeviceID, &micAddr, { _, _, _, _ -> OSStatus in
    DispatchQueue.main.async {
        gMicInUse = readMicInUse(deviceID: gDeviceID)
        emit()
    }
    return noErr
}, nil)

// MARK: - NSWorkspace notifications

let nc = NSWorkspace.shared.notificationCenter

nc.addObserver(forName: NSWorkspace.didLaunchApplicationNotification,
               object: nil, queue: .main) { note in
    guard let a = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
          isTeams(a) else { return }
    gTeamsRunning = true
    emit()
}

nc.addObserver(forName: NSWorkspace.didTerminateApplicationNotification,
               object: nil, queue: .main) { note in
    guard let a = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
          isTeams(a) else { return }
    gTeamsRunning = false
    emit()
}

// MARK: - Emit initial state and run forever

emit()
RunLoop.main.run()
