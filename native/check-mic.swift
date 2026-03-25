import CoreAudio
import CoreMediaIO
import Foundation

var gMicInUse      = false
var gCameraInUse   = false
var gAudioDeviceID = AudioDeviceID(kAudioObjectUnknown)

func emit() {
    print(gMicInUse || gCameraInUse ? "in_call" : "not_in_call")
    fflush(stdout)
}

// MARK: - Microphone (CoreAudio)

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

// MARK: - Camera (CoreMediaIO)

func cameraDeviceIDs() -> [CMIODeviceID] {
    var opa = CMIOObjectPropertyAddress(
        mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyDevices),
        mScope:    CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
        mElement:  CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
    var dataSize: UInt32 = 0
    CMIOObjectGetPropertyDataSize(CMIOObjectID(kCMIOObjectSystemObject), &opa, 0, nil, &dataSize)
    let count = Int(dataSize) / MemoryLayout<CMIODeviceID>.size
    var ids = [CMIODeviceID](repeating: 0, count: count)
    var dataUsed: UInt32 = 0
    CMIOObjectGetPropertyData(CMIOObjectID(kCMIOObjectSystemObject), &opa, 0, nil, dataSize, &dataUsed, &ids)
    return ids
}

func readCameraInUse(deviceID: CMIODeviceID) -> Bool {
    var value: UInt32 = 0
    let size  = UInt32(MemoryLayout<UInt32>.size)
    var addr  = CMIOObjectPropertyAddress(
        mSelector: CMIOObjectPropertySelector(kCMIODevicePropertyDeviceIsRunningSomewhere),
        mScope:    CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
        mElement:  CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
    var dataUsed: UInt32 = 0
    let status = CMIOObjectGetPropertyData(deviceID, &addr, 0, nil, size, &dataUsed, &value)
    return status == noErr && value > 0
}

func isAnyCameraInUse() -> Bool {
    cameraDeviceIDs().contains { readCameraInUse(deviceID: $0) }
}

// MARK: - Initial state

gAudioDeviceID = defaultInputDevice()
gMicInUse      = readMicInUse(deviceID: gAudioDeviceID)
gCameraInUse   = isAnyCameraInUse()

// MARK: - Microphone listener

var micAddr = AudioObjectPropertyAddress(
    mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
    mScope:    kAudioObjectPropertyScopeGlobal,
    mElement:  kAudioObjectPropertyElementMain)

AudioObjectAddPropertyListener(gAudioDeviceID, &micAddr, { _, _, _, _ -> OSStatus in
    DispatchQueue.main.async {
        gMicInUse = readMicInUse(deviceID: gAudioDeviceID)
        emit()
    }
    return noErr
}, nil)

// MARK: - Camera listeners (one per device)

for deviceID in cameraDeviceIDs() {
    var camAddr = CMIOObjectPropertyAddress(
        mSelector: CMIOObjectPropertySelector(kCMIODevicePropertyDeviceIsRunningSomewhere),
        mScope:    CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
        mElement:  CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
    CMIOObjectAddPropertyListener(deviceID, &camAddr, { _, _, _, _ -> OSStatus in
        DispatchQueue.main.async {
            gCameraInUse = isAnyCameraInUse()
            emit()
        }
        return noErr
    }, nil)
}

// MARK: - Emit initial state and run forever

emit()
RunLoop.main.run()
