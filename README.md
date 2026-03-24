# On Air

A macOS menu bar app that detects when you're on a Microsoft Teams call and automatically turns on a physical **ON AIR** LED sign via an ESP32 over Wi-Fi.

![off air](icon-off.png) Idle &nbsp;·&nbsp; ![on air](icon-on.png) On a call

---

## How it works

Every 5 seconds the app checks two conditions:

1. **Teams is running** — scans the process list for `Microsoft Teams.app/Contents/MacOS/MSTeams`
2. **Microphone is in use** — queries CoreAudio's `kAudioDevicePropertyDeviceIsRunningSomewhere` on the default input device (the same signal that triggers the orange mic indicator in the macOS menu bar)

When both are true it sends `POST /on` to the ESP32. When either stops it sends `POST /off`. The ESP32 drives a transistor that switches the LED sign's power.

The menu bar icon animates while you're on a call. You can also force the sign on or off manually via the context menu, independently of call detection.

---

## Hardware

| Component | Details |
|-----------|---------|
| LED sign | Any battery-powered ON AIR sign — tested with [this one](https://www.amazon.es/dp/B0C9ZD6GY6) |
| Microcontroller | ESP32 NodeMCU WROOM-32 (USB-C) |
| Transistor | NPN 2N2222 |
| Resistor | 1 kΩ |

### Circuit

The sign's original battery box is removed. The ESP32 is powered via USB and supplies 5 V to the sign through a transistor controlled by a GPIO pin.

```
[USB 5V power adapter]
        │
        └── USB-C → ESP32
                    ├── 5V  ──── Collector 2N2222 ──── [Sign +]
                    ├── GND ──────────────────────────── [Sign −]
                    └── GPIO ── 1kΩ ── Base 2N2222
```

---

## Software setup

### Requirements

- macOS
- Node.js ≥ 18
- Arduino IDE (for the ESP32 firmware)
- CH340 USB driver (for the ESP32 USB connection on older macOS)

### Install

```bash
git clone https://github.com/YOUR_USERNAME/onair
cd onair
npm install
```

### Build the mic detection binary

The app uses a small Swift binary to query CoreAudio — it only needs to be compiled once.

```bash
swiftc check-mic.swift -o check-mic
chmod +x check-mic
```

### Configure

Edit `main.js` and set the IP address assigned to your ESP32 on your local network:

```js
const ESP32_IP = '192.168.1.100'; // replace with your ESP32's IP
```

### Run

```bash
npm start        # production
npm run dev      # development (auto-reloads on file changes)
```

The app lives in the menu bar with no dock icon. Right-click the icon to access the menu.

---

## Menu

| Item | Description |
|------|-------------|
| **Turn On Air** | Force the sign on, regardless of call state |
| **Turn Off Air** | Force the sign off, regardless of call state |
| **Auto** | Return to automatic detection (enabled when an override is active) |
| **About…** | App info |
| **Quit** | Exit the app |

---

## ESP32 firmware

> Work in progress.

The firmware will run an HTTP server on port 80, respond to `POST /on` and `POST /off`, and drive the transistor via a GPIO pin.

---

## Roadmap

- [ ] ESP32 firmware
- [ ] UI to configure the ESP32 IP address (no code editing required)
- [ ] Packaging as a standalone `.app`
- [ ] Bluetooth BLE as an alternative to Wi-Fi — direct Mac ↔ ESP32 pairing, no IP configuration needed

---

## License

MIT — by [Today We Dream Tomorrow We Build](https://todaywe.com) ™
