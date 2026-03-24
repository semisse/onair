import CoreAudio
import Foundation

var gDeviceID = AudioDeviceID(kAudioObjectUnknown)

func emit() {
    print(readMicInUse(deviceID: gDeviceID) ? "in_call" : "not_in_call")
    fflush(stdout)
}

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

gDeviceID = defaultInputDevice()

var micAddr = AudioObjectPropertyAddress(
    mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
    mScope:    kAudioObjectPropertyScopeGlobal,
    mElement:  kAudioObjectPropertyElementMain)

AudioObjectAddPropertyListener(gDeviceID, &micAddr, { _, _, _, _ -> OSStatus in
    DispatchQueue.main.async { emit() }
    return noErr
}, nil)

emit()
RunLoop.main.run()
