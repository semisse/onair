import CoreAudio
import CoreMediaIO
import Foundation

var gMicInUse      = false
var gCameraInUse   = false
var gAudioDeviceID = AudioDeviceID(kAudioObjectUnknown)

// Tracks which camera device IDs already have listeners — prevents duplicate registration.
var gRegisteredCameraIDs = Set<CMIODeviceID>()

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

func addMicListener(deviceID: AudioDeviceID) {
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
        mScope:    kAudioObjectPropertyScopeGlobal,
        mElement:  kAudioObjectPropertyElementMain)
    AudioObjectAddPropertyListener(deviceID, &addr, { _, _, _, _ -> OSStatus in
        DispatchQueue.main.async {
            gMicInUse = readMicInUse(deviceID: gAudioDeviceID)
            emit()
        }
        return noErr
    }, nil)
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

// Registers a kCMIODevicePropertyDeviceIsRunningSomewhere listener on any camera device
// not yet tracked. Safe to call multiple times — skips already-registered IDs.
func registerCameraListeners() {
    for deviceID in cameraDeviceIDs() {
        guard !gRegisteredCameraIDs.contains(deviceID) else { continue }
        gRegisteredCameraIDs.insert(deviceID)
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIODevicePropertyDeviceIsRunningSomewhere),
            mScope:    CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement:  CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        CMIOObjectAddPropertyListener(deviceID, &addr, { _, _, _, _ -> OSStatus in
            DispatchQueue.main.async {
                gCameraInUse = isAnyCameraInUse()
                emit()
            }
            return noErr
        }, nil)
    }
}

// MARK: - Initial state

gAudioDeviceID = defaultInputDevice()
gMicInUse      = readMicInUse(deviceID: gAudioDeviceID)
gCameraInUse   = isAnyCameraInUse()

// MARK: - Microphone listener

addMicListener(deviceID: gAudioDeviceID)

// MARK: - Default input device change listener
//
// Fires when the default mic changes (hotplug, sleep/wake). Registers a listener
// on the new device and re-reads mic state.

var defaultInputAddr = AudioObjectPropertyAddress(
    mSelector: kAudioHardwarePropertyDefaultInputDevice,
    mScope:    kAudioObjectPropertyScopeGlobal,
    mElement:  kAudioObjectPropertyElementMain)

AudioObjectAddPropertyListener(AudioObjectID(kAudioObjectSystemObject), &defaultInputAddr,
    { _, _, _, _ -> OSStatus in
        DispatchQueue.main.async {
            let newDevice = defaultInputDevice()
            if newDevice != kAudioObjectUnknown && newDevice != gAudioDeviceID {
                gAudioDeviceID = newDevice
                addMicListener(deviceID: newDevice)
            }
            gMicInUse = readMicInUse(deviceID: gAudioDeviceID)
            emit()
        }
        return noErr
    }, nil)

// MARK: - Camera device list change listener
//
// Fires when CoreMediaIO re-enumerates devices — notably on system wake. Registers
// listeners on any new device IDs and re-reads camera state.

var devListAddr = CMIOObjectPropertyAddress(
    mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyDevices),
    mScope:    CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
    mElement:  CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))

CMIOObjectAddPropertyListener(CMIOObjectID(kCMIOObjectSystemObject), &devListAddr,
    { _, _, _, _ -> OSStatus in
        DispatchQueue.main.async {
            registerCameraListeners()
            gCameraInUse = isAnyCameraInUse()
            emit()
        }
        return noErr
    }, nil)

// MARK: - Register initial camera listeners + emit

registerCameraListeners()
emit()
RunLoop.main.run()
