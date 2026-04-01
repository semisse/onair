# ObviouslyBusy

![icon](assets/icon.png)

A macOS menu bar app that detects when your microphone or camera is in use and automatically turns on a physical sign via an ESP32 over Wi-Fi. Works with any app — Teams, Zoom, Google Meet, or anything else.

![off air](assets/icon-off.png) Idle &nbsp;·&nbsp; ![on air](assets/icon-on-0.png) Busy &nbsp;·&nbsp; ![free](assets/icon-teal.png) Free

---

## How it works

The app runs a persistent native Swift process that listens for two signals:

- **Microphone** — CoreAudio `AudioObjectAddPropertyListener` on the default input device (the same signal that triggers the orange mic indicator in the macOS menu bar)
- **Camera** — CoreMediaIO `CMIOObjectAddPropertyListener` on all connected video devices

When either activates it sends `POST /on` to the ESP32. When both stop it sends `POST /off`. The ESP32 drives a transistor that switches the sign's power. The response is instantaneous with zero CPU overhead in idle.

The menu bar icon animates while you're on a call. You can also force the sign on or off manually via the context menu, independently of call detection.

---

## Hardware

| Component | Details |
|-----------|---------|
| Microcontroller | ESP32 NodeMCU WROOM-32 (USB-C) |
| LEDs | 5mm red + green |
| Resistors | 2× 220Ω |
| Enclosure | 3D printed |

### Circuit

Two LEDs wired directly to GPIO pins — no transistor needed.

```
ESP32
  ├── GPIO4 ── 220Ω ── LED red   ── GND  (Busy)
  └── GPIO5 ── 220Ω ── LED green ── GND  (Free)
```

### LED behaviour

| State | Red | Green |
|-------|-----|-------|
| Auto, not in a call | off | on |
| Auto, in a call | on | off |
| Override Busy | on | off |
| Override Free | off | on |

---

## Software setup

### Requirements

- macOS
- Node.js ≥ 18
- Arduino IDE (for the ESP32 firmware)
- CH340 USB driver (for the ESP32 USB connection on macOS)

### Install

```bash
git clone https://github.com/semisse/obviouslybusy
cd obviouslybusy
npm install
```

### Build the native binary

The app uses a small Swift binary to monitor the mic and camera — it only needs to be compiled once.

```bash
swiftc native/check-mic.swift -o native/check-mic
chmod +x native/check-mic
```

### Configure

Open Settings from the menu bar icon and enter the IP address of your ESP32. Use the **Scan** button to find it automatically on your local network.

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
| **Busy** | Force the sign on, regardless of call state |
| **Free** | Force the sign off, regardless of call state |
| **Auto** | Return to automatic detection (enabled when an override is active) |
| **Settings…** | Configure ESP32 connection |
| **About…** | App info |
| **Quit** | Exit the app |

---

## ESP32 firmware

Flash the following sketch via Arduino IDE. The ESP32 must be on the same Wi-Fi network as your Mac.

```cpp
#include <WiFi.h>
#include <WebServer.h>

const char* SSID      = "YOUR_NETWORK";
const char* PASSWORD  = "YOUR_PASSWORD";
const int   PIN_RED   = 4;
const int   PIN_GREEN = 5;

WebServer server(80);

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RED,   OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  // default: free
  digitalWrite(PIN_RED,   LOW);
  digitalWrite(PIN_GREEN, HIGH);

  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println(WiFi.localIP());

  server.on("/on",   HTTP_POST, []{
    digitalWrite(PIN_RED, HIGH); digitalWrite(PIN_GREEN, LOW); server.send(200);
  });
  server.on("/off",  HTTP_POST, []{
    digitalWrite(PIN_RED, LOW); digitalWrite(PIN_GREEN, HIGH); server.send(200);
  });
  server.on("/ping", HTTP_GET, []{
    server.send(200, "application/json", "{\"device\":\"obviouslybusy\"}");
  });
  server.begin();
}

void loop() { server.handleClient(); }
```

After flashing, open the Serial Monitor at 115200 baud to find the assigned IP, then enter it in Settings.

---

## Roadmap

- [ ] Packaging as a standalone `.app`
- [ ] End-user onboarding: WiFiManager captive portal + mDNS (`obviouslybusy.local`) + automatic firmware flashing via bundled esptool
- [ ] USB mode: communicate with the ESP32 directly via USB serial, no WiFi or Bluetooth needed

---

## License

MIT — by [Today We Dream Tomorrow We Build](https://todaywe.com) ™
