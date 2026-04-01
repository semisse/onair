import Foundation
import CoreBluetooth

let SERVICE_UUID = CBUUID(string: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890")
let CHAR_UUID    = CBUUID(string: "A1B2C3D4-E5F6-7890-ABCD-EF1234567891")

class BLEBridge: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    var central: CBCentralManager!
    var peripheral: CBPeripheral?
    var characteristic: CBCharacteristic?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func send(_ command: String) {
        guard let p = peripheral, let c = characteristic else { return }
        guard let data = command.data(using: .utf8) else { return }
        p.writeValue(data, for: c, type: .withResponse)
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            central.scanForPeripherals(withServices: [SERVICE_UUID])
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        self.peripheral = peripheral
        central.stopScan()
        central.connect(peripheral)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([SERVICE_UUID])
        print("connected")
        fflush(stdout)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral,
                        error: Error?) {
        self.peripheral = nil
        self.characteristic = nil
        print("disconnected")
        fflush(stdout)
        central.scanForPeripherals(withServices: [SERVICE_UUID])
    }

    // MARK: - CBPeripheralDelegate

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let service = peripheral.services?.first(where: { $0.uuid == SERVICE_UUID }) else { return }
        peripheral.discoverCharacteristics([CHAR_UUID], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService,
                    error: Error?) {
        guard let char = service.characteristics?.first(where: { $0.uuid == CHAR_UUID }) else { return }
        self.characteristic = char
    }
}

let bridge = BLEBridge()

FileHandle.standardInput.readabilityHandler = { handle in
    let data = handle.availableData
    if data.isEmpty { exit(0) }
    if let str = String(data: data, encoding: .utf8) {
        let command = str.trimmingCharacters(in: .whitespacesAndNewlines)
        if command == "on" || command == "off" {
            bridge.send(command)
        }
    }
}

RunLoop.main.run()
