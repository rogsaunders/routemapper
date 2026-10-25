# RouteMapper Workflow — October 2026

| | |
|---|---|
| **Edition** | October 2026 (replaces Workflow v7, April 2026) |
| **Audience** | Organisers, navigators and partners planning to use RouteMapper on an event |
| **Master copy** | GitHub `docs/route-mapper-workflow.md` |

This is the end-to-end field workflow: from preparing a recce, through recording and reviewing, to entrants following the finished roadbook. For every button and setting, see the [User Guide](user-guide.md). For what the product is, see the [Specification](specification.md).

```
 PREPARE ──► RECORD ──► END STAGE ──► REVIEW ──► DISTRIBUTE ──► TRAVEL
 iPad,       track +     roadbook +    check and   ZIP / Library   entrants
 settings    waypoints   export ZIP    refine                     follow it
```

---

## 1. Prepare

1. **Charge and mount** the iPad within easy reach of the navigator. A Bluetooth headset (mic) or foot pedal is strongly recommended.
2. **Open** [app.routemapper.net](https://app.routemapper.net) in Safari — ideally installed to the Home Screen — and sign in (or *Continue as Guest*).
3. **Location permission:** *While Using*, with *Precise Location* on. For voice on iPad, allow Safari in both *Settings → Safari → Microphone* and *Settings → Privacy & Security → Speech Recognition*.
4. **Set the stage identity** at the top: **Trip name**, **Day**, **Route** (with a descriptive Route name) and **Stage**.
5. **Check settings** (⚙️): snap window (default 5 s), voice silence timeout (default 2.5 s), voice snap window (default 5 s), external trigger on/off.
6. **Pre-load maps** by panning around the area while you still have signal.

## 2. Record

1. Tap the green **Start Stage**. Tracking begins and the current position becomes the stage start (captured automatically when the first good GPS fix arrives). If the true start is further on, tap **🚩 Update Start** when you reach it.
2. **Drive the route.** The track is recorded continuously (one point every 5 s once you've moved 5 m). Keep RouteMapper in the foreground — on iOS, switching apps can pause GPS.
3. **Capture waypoints** using whichever method suits the moment:

| Situation | Method | How |
|---|---|---|
| Standard instruction, hand free | **Tap** | Tap **Add Waypoint** — GPS locks instantly — pick the icon, optionally type a note; it saves after the snap window or on **✓ Done** |
| Hands busy, or a detail worth saying | **Push-to-talk** | Tap **🎙 Record** (or press the headset/pedal) — GPS locks — say e.g. *"left onto Forbes Road"* |
| Several icons at one spot | **Tap repeatedly** | Each tap creates another waypoint at the same position (e.g. control + fuel + service) |
| Mistake | **Fix it** | **Discard** before it saves, say *"cancel"*, or later use ✏️ edit / 🗑 delete on the row |

**Voice phrasing:** `[type] [icon] — [note]`. The type can be dropped when the icon is unambiguous.

| Say | Result |
|---|---|
| *"hazard danger two — rocks on track"* | Hazard · Danger 2 · "rocks on track" |
| *"left — onto gravel road"* | Nav · Left · "onto gravel road" |
| *"terrain washout"* | Terrain · Washout |
| *"control fuel — stop for fuel"* | Control · Fuel · "stop for fuel" |
| *"speed sixty"* | Speed · 60 km/h |
| *"note — fuel stop ahead"* | Note · "fuel stop ahead" |
| *"cancel"* | Discards the pending waypoint |

**Wrong turn?** Delete the unwanted waypoints (most recent first) and carry on — the track itself is never edited.

## 3. End the stage

1. Tap the red **End Stage**. RouteMapper warns if the track has a suspicious gap (for example if the device slept), so you can re-drive a section before leaving.
2. The app then automatically:
   - generates the roadbook (turn detection, tulips, distances, CAP headings);
   - saves the stage to **Stage History**;
   - builds and downloads the **export ZIP**;
   - syncs to the cloud if signed in and online (or queues it until you are).
3. Move to the next stage with the Day / Route / Stage controls, which unlock once the stage has ended.

## 4. Review

Best done on a laptop or iPad after the day's recording.

1. Switch to **Review** in the mode picker. It opens on the stage just ended; pick any other stage from the drop-down.
2. Stay in **Driver** view — it is exactly what the printed roadbook shows. Use **Raw** only to investigate a tulip.
3. Tap through the rows; the map flies to each one. Switch to **Satellite** to check junction shapes.
4. Fix notes inline (Tab moves to the next row) or tap **✎ Edit** to change an icon.
5. Use the **Average speed** panel between waypoints to set target times for controls.
6. Re-export the stage from **History → ↓ Re-export ZIP** so the files include your edits.

> Optional: final wording can be polished in `Printable/roadbook.docx`. Travel mode picks up those edited notes if the DOCX is saved back into the ZIP. Do this **last** — re-exporting from History regenerates the DOCX and overwrites edits.

## 5. Distribute

| To | Give them | From the ZIP |
|---|---|---|
| Entrants following on a phone or iPad | The ZIP (or its `stage.json`) — opened in RouteMapper Travel, free, no account | whole ZIP |
| Entrants using Rally Navigator | `route.gpx` | `RallyNavigator/` |
| Entrants with Garmin, Hema, Gaia or Google Earth | the tool's folder, or `route.gpx` / `route.kml` | `Garmin/`, `Hema/`, `Gaia/`, `Universal/` |
| Printing the roadbook | `roadbook.html` (print from a browser) or `roadbook.docx` | `Printable/` |
| Officials and spreadsheets | `roadbook.csv`, `map.pdf` | `Printable/` |
| The public, later | Submit the route to the **Route Library** (approved authors) | whole ZIP |

## 6. Travel — following the roadbook

1. Open **Travel** in the app, or the standalone app at [go.routemapper.net](https://go.routemapper.net), and load the ZIP, `stage.json` or a GPX file.
2. **Before setting off:** Settings → 🗺 **Offline map → Save for offline** while you still have signal; turn on 🔊 voice readout (tap once so iOS allows speech).
3. The **Head to the start** screen shows distance and direction to the start and announces *"At start"* when you arrive. Tap **Begin driving**.
4. The current row advances automatically as you pass each waypoint (30 m trigger radius by default — 50–60 m on fast open roads, 10–15 m for walkers and cyclists). Use ◀ ▶ to correct, ⏸ to pause, ↺ to return to the current row.
5. **Distance to next** follows the road and matches the printed roadbook. More than 100 m off the route, it shows *off-route* and switches to straight-line distance.
6. Use **track-up** (compass button) so the map turns with the vehicle.

## 7. Timing guide

| Action | Typical time |
|---|---|
| Start a stage | ~5 s |
| Tap waypoint, no note | ~2 s |
| Tap waypoint with typed note | ~5 s |
| Push-to-talk waypoint | ~3–4 s (position locked at the tap) |
| End stage (roadbook + export) | ~15–20 s |

## 8. Troubleshooting in the field

| Problem | What to do |
|---|---|
| GPS shows *waiting* | Move the device to a clearer view of the sky; check location permission |
| Voice not recognised | Check both iOS permissions; use a headset; fall back to tap capture (works offline) |
| Voice says "service unreachable" | No internet, Microsoft Edge, or an ad-blocking DNS service — use Safari/Chrome or tap capture |
| Headset button doesn't fire Record | Check ⚙️ External trigger is on and a stage is recording (the 🎧 icon shows when active) |
| Stage not syncing | Header shows *Pending (n)* — it uploads automatically when back online |
| Storage warning | Export and delete old test stages from History |
| App closed or battery died | The active stage autosaves on the device; reopen the app to recover |

---

### Document history

| Edition | Date | Notes |
|---|---|---|
| October 2026 | Oct 2026 | Push-to-talk replaces wake word; adds Review, Travel, distribution and Route Library; corrected icon count (38, six groups) and history limit (200) |
| v7 | Apr 2026 | Wake-word hands-free voice (superseded). Archived in `docs/archive/` |
