# ClypPad

A sleek, infinite-canvas scratchpad for notes, folders, labels, images, and voice notes — built as a single static HTML file.

**Important:** This app stores everything **locally in your browser** using `localStorage`. There is **no server** and **no sync** yet

Live demo: https://siv-the-programmer.github.io/Clyp_pad/

---

## Features

- Infinite canvas (pan + zoom)
- Cards:
  -  Notes (auto-save)
  -  Folders (nested boards)
  -  Labels (size + color)
  -  Images (drag/drop upload)
  -  Voice notes (record + playback)
- Drag cards anywhere
- Context menu (rename, duplicate, copy text, delete)
- Breadcrumb navigation for folders
- Fit-to-view / zoom controls
- Keyboard shortcuts

---

## Data & Privacy (Read This)

### Where your data is stored
All data is saved in your browser under:

- `localStorage` key: `csp2`
- Scope: **this device + this browser + this domain** (`siv-the-programmer.github.io`)

### Can other people see my stuff?
**No.** Other users cannot see your notes because `localStorage` is private to their own browser/device.

### What are the downsides?
- **No syncing:** another device/browser won’t have your board.
- **Risk of loss:** clearing site data wipes everything.
- **Storage limits:** images and voice notes are stored as Base64 in `localStorage`, which can fill up quickly.

If you want multi-user accounts + cloud sync, you’ll need a backend (see “Future upgrades”).

---

## Controls

### Mouse / Trackpad
- **Pan:** hold **Space** + drag (or middle mouse drag)
- **Zoom:** scroll wheel / trackpad scroll
- **Create note:** double-click empty canvas
- **Select:** click a card
- **Context menu:** right-click a card

### Touch (Mobile)
- **Pan:** drag
- **Zoom:** pinch
- **Create note:** double-tap (browser dependent)

---

## Keyboard Shortcuts

- `Ctrl/Cmd + S` → Save active note
- `Ctrl/Cmd + =` → Zoom in
- `Ctrl/Cmd + -` → Zoom out
- `Ctrl/Cmd + 0` → Fit all
- `Esc` → Close modals / clear selection
- `Delete` / `Backspace` → Delete selected card (when not typing)

---

## Run Locally

Option 1: open the file directly
1. Download/clone this repo
2. Open `index.html` in your browser

Option 2: use a local server (recommended)
```
# Python 3
python -m http.server 8000

Then open:
http://localhost:8000

---

## Note: 
Microphone recording works best over HTTPS or localhost. Some browsers block mic access on plain
http:// on non-localhost domains.

---

## Project Structure
This project is intentionally simple:
index.html — contains HTML, CSS, and JS in one file