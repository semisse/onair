import CoreAudio
import Foundation

// Get default input device
var inputDeviceID = AudioDeviceID(kAudioObjectUnknown)
var size = UInt32(MemoryLayout<AudioDeviceID>.size)
var address = AudioObjectPropertyAddress(
    mSelector: kAudioHardwarePropertyDefaultInputDevice,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain
)
AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &inputDeviceID)

// Check if any process is using the input device (the orange dot signal)
var isRunning: UInt32 = 0
var isRunningSize = UInt32(MemoryLayout<UInt32>.size)
var isRunningAddress = AudioObjectPropertyAddress(
    mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain
)
AudioObjectGetPropertyData(inputDeviceID, &isRunningAddress, 0, nil, &isRunningSize, &isRunning)

print(isRunning > 0 ? "in_use" : "not_in_use")
