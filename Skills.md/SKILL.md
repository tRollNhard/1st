---
name: bt-device-manager
description: >
  A skill for generating a complete Bluetooth Device Manager system — a multi-device
  Bluetooth control hub that uses Wi-Fi agents to let one device (phone, PC, or tablet)
  disconnect and reconnect Bluetooth devices (speakers, headphones, printers, etc.) across
  ALL your devices (PCs, Android phones, TVs) without touching each one manually.
  Use this skill when the user wants to build, customize, or deploy a BT manager system
  with a web dashboard, Python GUI, auto-discovery, notifications, and priority fallback.
---

# Bluetooth Device Manager Skill

## What This Skill Does

This skill generates a **complete multi-device Bluetooth control system** consisting of:

1. **Wi-Fi Agents** — Lightweight services that run on each device (PC, Android, TV) and
   expose Bluetooth control via a REST API on the local network
2. **Web Dashboard** — A browser-based control panel with buttons to pair/unpair/connect/disconnect
   any Bluetooth device on any networked device
3. **Python Desktop GUI** — A native desktop app with the same functionality
4. **Auto-Discovery** — Agents automatically find each other on the local network using
   UDP broadcast (no manual IP entry required)
5. **Notification System** — Real-time status updates and error alerts
6. **Priority & Fallback** — Configurable device priority lists with automatic fallback

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      YOUR LOCAL WI-FI NETWORK                    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   PC Agent   │  │ Phone Agent  │  │   TV Agent   │    ...    │
│  │  (Python)    │  │  (Python)    │  │  (Python)    │           │
│  │              │  │              │  │              │           │
│  │ ● BT Radio   │  │ ● BT Radio   │  │ ● BT Radio   │           │
│  │ ● REST API   │  │ ● REST API   │  │ ● REST API   │           │
│  │ ● Port 8377  │  │ ● Port 8377  │  │ ● Port 8377  │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                  │                  │                    │
│         └──────────────────┼──────────────────┘                    │
│                            │                                       │
│                   UDP Auto-Discovery                               │
│                    (Broadcast :8378)                                │
│                            │                                       │
│                ┌───────────┴───────────┐                           │
│                │   CONTROLLER DEVICE    │                           │
│                │                        │                           │
│                │  ┌──────────────────┐  │                           │
│                │  │  Web Dashboard   │  │  ← Browser-based UI      │
│                │  │  (Port 8380)     │  │     with buttons          │
│                │  └──────────────────┘  │                           │
│                │          OR            │                           │
│                │  ┌──────────────────┐  │                           │
│                │  │  Python GUI App  │  │  ← Native desktop app    │
│                │  └──────────────────┘  │                           │
│                └────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Wi-Fi Agent (`agent.py`)

The agent runs on EVERY device you want to control. It is a lightweight Python
Flask/FastAPI server that:

- **Exposes Bluetooth controls** via REST API on port `8377`
- **Announces itself** via UDP broadcast on port `8378` every 10 seconds
- **Reports status** including connected BT devices, available BT devices, signal strength
- **Executes commands**: pair, unpair, connect, disconnect, scan, trust, remove

#### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Agent status, hostname, OS, BT adapter info |
| GET | `/api/devices` | List all known/paired BT devices |
| GET | `/api/devices/connected` | List currently connected BT devices |
| GET | `/api/scan` | Trigger BT scan, return discovered devices |
| POST | `/api/connect` | Connect to a BT device by MAC address |
| POST | `/api/disconnect` | Disconnect a BT device by MAC address |
| POST | `/api/pair` | Pair with a new BT device |
| POST | `/api/unpair` | Remove pairing with a BT device |
| POST | `/api/trust` | Trust a BT device (auto-connect) |
| GET | `/api/ping` | Health check |

#### Platform-Specific BT Backends

| Platform | Backend | Library/Tool |
|----------|---------|-------------|
| **Linux PC** | `bluetoothctl` via subprocess | Built-in BlueZ |
| **Windows PC** | WMI + PowerShell BT cmdlets | `pybluez2` or `bleak` |
| **Android** | Termux + `bluetoothctl` OR companion app | Termux API |
| **Android TV** | ADB shell commands via network | `adb` over TCP |
| **Smart TV (Linux-based)** | SSH + `bluetoothctl` | SSH access required |

### 2. Auto-Discovery System

Agents discover each other without manual configuration:

```
Agent Startup:
  1. Bind UDP socket on port 8378
  2. Every 10 seconds, broadcast: {"agent": hostname, "ip": local_ip, "port": 8377, "os": platform}
  3. Listen for broadcasts from other agents
  4. Maintain a live registry of discovered agents (expire after 30s no-broadcast)
```

**Discovery Packet Format (JSON over UDP broadcast):**
```json
{
  "service": "bt-device-manager",
  "version": "1.0",
  "hostname": "JasonsPC",
  "ip": "192.168.1.50",
  "port": 8377,
  "os": "windows",
  "bt_adapter": "Intel AX200",
  "timestamp": 1708444800
}
```

### 3. Web Dashboard (`dashboard.html` + `dashboard_server.py`)

A responsive web UI served by the controller device:

- **Device Cards** — One card per discovered agent showing hostname, OS icon, connection status
- **BT Device List** — Under each card, paired/connected Bluetooth devices with action buttons
- **Action Buttons** — Connect, Disconnect, Pair, Unpair, Scan — each triggers the agent API
- **Status Bar** — Real-time notifications (success/failure/warnings)
- **Priority Manager** — Drag-and-drop to set device connection priority order
- **Quick Actions** — "Disconnect All," "Connect Favorites," "Switch Speaker To..."

**Tech Stack:** HTML5 + Tailwind CSS + Vanilla JS (no build step, runs in any browser)

### 4. Python Desktop GUI (`gui_app.py`)

A native desktop application using `tkinter` (built into Python):

- Same functionality as web dashboard
- System tray icon with quick actions
- Desktop notifications via `plyer` library
- Runs on Windows, Linux, macOS

### 5. Notification System

| Event | Notification |
|-------|-------------|
| Device connected | "✅ JBL Speaker connected to PC" |
| Device disconnected | "🔌 AirPods disconnected from Phone" |
| Connection failed | "❌ Failed to connect HP Printer — device out of range" |
| Agent went offline | "⚠️ TV Agent is no longer responding" |
| New device discovered | "🔍 New BT device found: Unknown Device (AA:BB:CC:DD:EE)" |
| Priority fallback triggered | "🔄 Speaker unavailable on PC, connecting to Phone instead" |

**Delivery Methods:**
- Web dashboard: Toast notifications in-browser
- Python GUI: Desktop OS notifications
- Optional: Push notifications via ntfy.sh (free, self-hosted push service)

### 6. Priority & Fallback System

Users define priority lists per Bluetooth device:

```json
{
  "JBL Flip 6": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "priority": ["JasonsPC", "JasonsPhone", "LivingRoomTV"],
    "auto_fallback": true,
    "fallback_delay_seconds": 5
  }
}
```

**Logic:**
1. When "Connect JBL Flip 6" is triggered, try priority[0] first
2. If fails/unavailable, wait `fallback_delay_seconds`, try priority[1]
3. Continue down the list
4. Notify user which device it connected to (and if fallback was used)

---

## File Structure

When this skill generates the BT Device Manager, it creates:

```
bt-device-manager/
├── README.md                       # Setup guide & documentation
├── requirements.txt                # Python dependencies
├── config.json                     # User configuration (devices, priorities)
│
├── agent/                          # Wi-Fi Agent (runs on each device)
│   ├── agent.py                    # Main agent server (Flask/FastAPI)
│   ├── bt_backend_linux.py         # Linux bluetoothctl backend
│   ├── bt_backend_windows.py       # Windows BT backend
│   ├── bt_backend_android.py       # Android/Termux BT backend
│   ├── discovery.py                # UDP auto-discovery module
│   └── config.py                   # Agent configuration loader
│
├── controller/                     # Controller (runs on your main device)
│   ├── dashboard_server.py         # Serves web dashboard + proxies API calls
│   ├── gui_app.py                  # Python tkinter desktop GUI
│   ├── discovery_client.py         # Discovers agents on network
│   ├── priority_manager.py         # Priority & fallback logic
│   ├── notification_manager.py     # Notification routing
│   └── static/                     # Web dashboard files
│       ├── index.html              # Main dashboard page
│       ├── style.css               # Tailwind-based styling
│       └── app.js                  # Dashboard JavaScript
│
├── scripts/                        # Setup & utility scripts
│   ├── install_agent_linux.sh      # One-line Linux agent installer
│   ├── install_agent_windows.bat   # One-click Windows agent installer
│   ├── install_agent_android.sh    # Termux agent installer
│   ├── start_agent.py              # Cross-platform agent launcher
│   └── start_controller.py         # Cross-platform controller launcher
│
└── tests/                          # Test suite
    ├── test_discovery.py           # Auto-discovery tests
    ├── test_bt_backends.py         # BT backend mock tests
    └── test_api.py                 # Agent API tests
```

---

## Setup & Deployment Guide

### Step 1: Install Agent on Each Device

**On a Linux PC:**
```bash
curl -sSL https://raw.githubusercontent.com/.../install_agent_linux.sh | bash
# OR manually:
pip install flask bleak zeroconf
python agent/agent.py
```

**On a Windows PC:**
```
Double-click install_agent_windows.bat
# OR manually:
pip install flask bleak zeroconf
python agent/agent.py
```

**On Android (via Termux):**
```bash
pkg install python bluetooth-utils
pip install flask
python agent/agent.py
```

### Step 2: Start Controller on Your Main Device

```bash
python scripts/start_controller.py
# Opens web dashboard at http://localhost:8380
# AND/OR launches desktop GUI
```

### Step 3: Devices Auto-Discover Each Other

Within 10 seconds, all agents on your Wi-Fi network appear in the dashboard.
No manual IP entry needed.

---

## How Claude Should Use This Skill

When the user asks to create or customize a BT Device Manager:

1. **Read this SKILL.md first** to understand the full architecture
2. **Read references/api-spec.md** for the complete API specification
3. **Read references/bt-backends.md** for platform-specific Bluetooth commands
4. **Read references/setup-guides.md** for detailed installation instructions
5. **Ask the user** which components they want (all, or specific ones)
6. **Generate the code** following the file structure above
7. **Include setup instructions** tailored to the user's devices
8. **Test connectivity** by generating mock discovery packets and API responses

### Customization Options to Ask About

- Which devices will run agents? (PC, phone, TV, etc.)
- Which device is the primary controller?
- Do they want the web dashboard, GUI app, or both?
- Any specific BT devices to pre-configure in config.json?
- Do they want autostart on boot?
- Do they want the optional push notification service?

---

## Dependencies

| Package | Purpose | Required On |
|---------|---------|-------------|
| `flask` | REST API server | All agents |
| `bleak` | Cross-platform BT library | Windows/macOS agents |
| `pydbus` | D-Bus interface for BlueZ | Linux agents |
| `zeroconf` | mDNS discovery (backup) | All devices |
| `plyer` | Desktop notifications | Controller (GUI) |
| `tkinter` | Desktop GUI | Controller (GUI) |
| `requests` | HTTP client for API calls | Controller |
| `netifaces` | Network interface detection | All devices |

---

## Security Considerations

Since this runs on your LOCAL network only:

- **No internet exposure** — agents only bind to local network interfaces
- **API key authentication** — simple shared secret in config.json
- **Device allowlist** — only pre-approved agent hostnames can execute commands
- **HTTPS optional** — can enable self-signed certs for encrypted local traffic
- **No cloud dependency** — everything runs locally, your data never leaves your network

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Agent not discovered | Check both devices on same Wi-Fi subnet; check firewall ports 8377-8378 |
| BT command fails on Linux | Ensure user is in `bluetooth` group: `sudo usermod -aG bluetooth $USER` |
| BT command fails on Windows | Run agent as Administrator for BT access |
| Android agent won't control BT | Enable Termux Bluetooth permissions in Android settings |
| Connection drops randomly | Check BT device isn't auto-connecting to another device; use Trust feature |
| Dashboard won't load | Check port 8380 isn't blocked; try `http://IP:8380` from another device |

---

## Future Enhancements (v2.0 Roadmap)

- **macOS/iOS support** via CoreBluetooth framework
- **Voice control** integration (Google Home / Alexa routines)
- **Scheduling** — auto-switch speaker to bedroom at 10 PM
- **Presence detection** — auto-connect when phone joins Wi-Fi
- **Plugin system** — support for custom device types
- **Cross-skill integration** — connect with skill-vault for config management
