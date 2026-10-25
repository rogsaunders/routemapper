# RouteMapper Specification — October 2026

| | |
|---|---|
| **Edition** | October 2026 (replaces *Functional and Technical Specification v3.1*, September 2025) |
| **Product status** | Live in production since May 2026 |
| **Audience** | Investors and partners (event organisers, tour operators, clubs) |
| **Product lead** | Roger Saunders |
| **Web** | [routemapper.net](https://routemapper.net) · app: [app.routemapper.net](https://app.routemapper.net) · travel app: [go.routemapper.net](https://go.routemapper.net) |
| **Master copy** | GitHub `docs/specification.md` — any copy elsewhere (e.g. Notion) is a published view of this file |

Companion documents: [Architecture](architecture.md) (how it is built) · [Workflow](route-mapper-workflow.md) (step by step in the field) · [User Guide](user-guide.md) (every button explained).

---

## 1. Summary

RouteMapper turns a drive, ride or walk into a professional roadbook — and then lets someone else follow that roadbook live, on a phone or tablet.

An organiser mounts an iPad, taps **Start Stage** and drives the route. RouteMapper records the GPS track continuously, the navigator drops waypoints with a tap or a spoken phrase, and when the stage ends the app produces a complete roadbook: tulip diagrams, distances, compass headings (CAP) and notes, in print and digital formats, plus files for the navigation tools the industry already uses (Rally Navigator, Garmin, Hema, Gaia GPS, Google Earth).

The same data then drives **Travel Mode**, an in-vehicle roadbook reader that advances row by row from the device's GPS position and reads each instruction aloud. Record once, review, then navigate — one product, one data set.

RouteMapper has been live since May 2026 with a free tier and paid plans billed through Stripe. It runs in any modern web browser, with no installation required, and is optimised for iPad.

## 2. The problem

Producing a roadbook for a rally, charity drive or guided tour is slow, manual work:

- **Recce is fiddly.** A navigator writes notes, reads an odometer and photographs signs while the vehicle moves. Every note takes 30–60 seconds and is easily lost or misplaced.
- **Production is a second job.** Those notes are re-typed and the tulip diagrams drawn by hand, often over several evenings, with transcription errors along the way.
- **Formats don't connect.** Each navigation device or app wants its own file format, so the same route is re-entered more than once.
- **Following the roadbook is still paper.** Entrants read a printed book and track distances on a trip meter.

RouteMapper removes the re-typing and re-drawing: the recorded GPS track *is* the roadbook, and the same file feeds every downstream tool.

## 3. Who it is for

| User | What they get |
|---|---|
| **Event organisers** — competitive, fun and fundraising rallies | Fast recce, a generated roadbook ready for entrants, and Rally Navigator-ready files |
| **Navigators and co-drivers** | Two-second waypoint capture by tap or voice, without taking eyes off the road for long |
| **4WD and adventure tour operators** | Verified guided routes to share with clients as GPX/KML or a followable roadbook |
| **Motorcycle, cycling and trekking events** | The same record → review → follow workflow, on a phone mounted to handlebars or carried |
| **Families and independent travellers** | A record of a trip that can be shared and followed by others |

## 4. How it works

RouteMapper is one product with three working modes, plus a lightweight companion app.

```
  RECORD  ─────────►  REVIEW  ─────────►  EXPORT  ─────────►  TRAVEL
  drive the route     check and refine    one organised       follow the
  tap or speak        the roadbook        ZIP per stage       roadbook live
  waypoints                                                   (GPS + voice)
```

1. **Record** — drive the route; RouteMapper records the track and captures waypoints.
2. **Review** — on a laptop or tablet, check each roadbook row against the map and refine notes and icons.
3. **Export** — one ZIP per stage containing the printable roadbook and files for every common navigation tool.
4. **Travel** — load the export into Travel Mode (in the main app, or the free standalone RouteMapper Travel app) and follow it, with automatic advance and spoken instructions.

## 5. Components and status

| Component | What it is | Status |
|---|---|---|
| **Record mode** | Route capture: GPS track, waypoints, voice, stage hierarchy | ✅ Live |
| **Review mode** | Organiser workbench: map and roadbook side by side, edit in place | ✅ Live |
| **Travel mode** | In-vehicle roadbook reader with GPS auto-advance and voice | ✅ Live |
| **RouteMapper Travel** | Travel mode as its own small installable app at go.routemapper.net, no sign-in needed | ✅ Live |
| **Route Library** | Catalogue of routes shared by authors, loadable straight into Travel | 🟡 Early access (free routes only) |
| **Paid routes (60/40 author share)** | Authors sell routes; RouteMapper keeps 40% | 🔵 Designed, not built |
| **Native iOS app (App Store)** | Packaged iPhone/iPad app | ⏸ Paused — to be resumed at the right time |
| **Android tablet polish, team collaboration, more icon packs** | Expansion items | 🔵 Planned, prioritised by user feedback |

## 6. Features

### 6.1 Organising an event: Trip → Day → Route → Stage

Multi-day events are organised in four levels. A **Trip** (e.g. *Flinders Ranges 2026*) contains **Days**, each Day contains **Routes** (each with a descriptive name), and each Route contains **Stages**. Every stage is saved independently, so a multi-day event exports as a tidy, consistently named set of files.

### 6.2 Capturing a route

**Continuous GPS track.** While a stage is recording, RouteMapper logs the vehicle's position every five seconds, ignoring movements under five metres (GPS "jitter") and any fix with poor accuracy. The device screen is kept awake, and the app warns if device storage is running low or if the track has an unexpected gap.

**Start point.** Tapping **Start Stage** captures the start position; it can be reset with **Update Start** if the real start is a little further on.

**Snap-first waypoints.** When the navigator taps **Add Waypoint**, the GPS position is locked *at that instant*. They then have a short, adjustable window (default five seconds) to choose an icon and add a note before it saves automatically. At 100 km/h, a few seconds' delay between tap and save would otherwise misplace the waypoint by 50–140 metres; snap-first removes that error. Several waypoints can share one spot (for example a control point with fuel and service).

**Push-to-talk voice.** Tapping **🎙 Record** locks the GPS position, then the navigator speaks a short command such as *"left onto Forbes Road"* or *"hazard danger two — rocks on track"*. RouteMapper picks the icon and note from the phrase and saves the waypoint at the locked position. Saying *"cancel"* discards it. Speech recognition uses Australian English.

Earlier versions used a spoken wake word ("Mapper"). Field testing showed engine noise and wind made wake words unreliable, so in May 2026 it was replaced with this deterministic button.

**External trigger.** The Record button can be fired without touching the screen — from a Bluetooth headset's play/pause button, a Bluetooth foot pedal, a presenter clicker or a keyboard. This matters when the tablet is mounted out of reach.

**Rally-standard icons.** 38 icons in six groups, compatible with OpenRally and Garmin symbol conventions:

| Group | Icons |
|---|---|
| Nav | Left, Right, Keep Left, Keep Right, Straight, On Left, On Right, Gate, Cattle Gate, Railroad, Give Way, Caution |
| Hazard | Danger 1, Danger 2, Danger 3 |
| Terrain | Bump, Bumps, Dip, Twisty, Ruts, Washout, Up Hill, Down Hill |
| Control | Start, Finish, Stop/Restart, Checkpoint, Time Control, Fuel, Service |
| Speed | 25, 40, 50, 60, 80, 100, 110 km/h |
| Note | General note |

**Corrections in the field.** Any waypoint can be edited (icon, note) or deleted during the stage or afterwards, without affecting the recorded track.

### 6.3 Automatic roadbook generation

When a stage ends, RouteMapper's roadbook engine turns the raw track into a structured roadbook:

1. **Smooths** the track to remove GPS noise.
2. **Detects turns** — any heading change over 25° becomes a candidate instruction — and classifies them (left 90, bear right, straight on and so on).
3. **Merges** the navigator's waypoints with the detected turns, snapping each waypoint onto the recorded track so distances are exact.
4. **Scores confidence** for every detected turn, based on track quality.
5. **Produces two views**: a *Driver* view containing only high-confidence instructions (the printed roadbook) and a *Raw* view of every detected event (for checking).

Each roadbook row carries cumulative and partial distance, a tulip diagram drawn from the real road geometry, CAP headings in and out, the icon and note, and the capture time.

### 6.4 Review mode — the organiser's workbench

A split screen with the map on one side and the roadbook on the other, designed for a laptop or iPad before an event:

- Tap a row and the map flies to it; tap a map marker and the row scrolls into view.
- Switch between street, terrain and satellite imagery to check that each tulip matches the real corner.
- Edit notes directly in the list (Tab moves to the next row) or change icons in place.
- Works on the stage just recorded or any saved stage; edits sync to the cloud for signed-in users.
- An average-speed panel reports moving speed and stationary time between any two waypoints — useful for setting time controls.

### 6.5 Travel mode — following the roadbook

Travel mode is the in-vehicle reader. It is available in the main app and as **RouteMapper Travel**, a separate, much smaller installable app at go.routemapper.net that needs no account — ideal for entrants or co-drivers who only need to follow a route.

- **Loads** a RouteMapper export ZIP, its `stage.json`, or a plain GPX track from any other tool (including Rally Navigator), which it runs through the same roadbook engine.
- **Head to the start** — a pre-start screen shows the start point on a map with live distance and direction, and announces when you arrive.
- **Auto-advance** — the current row moves on automatically as the vehicle passes each waypoint (default trigger radius 30 m, adjustable 5–100 m). Manual back/forward and pause are always available.
- **Along-track distance** — "distance to next" follows the recorded road, matching the printed roadbook's figures. More than 100 m off the route, the display switches to straight-line distance and flags *off-route*.
- **Voice readout** — announces each upcoming instruction with the distance to reach it (*"Next. Turn left. In 0.4 kilometres. Onto Forbes Road."*), after a short, adjustable settle delay.
- **Live map** — satellite, street, topographic or line-only views; north-up or track-up; follow or whole-stage view; tap any point to jump to that row.
- **Offline** — map tiles for a corridor around the route can be saved in advance, so the map keeps working with no signal. The loaded stage survives the app being closed and reopened.
- **Edit in Word** — notes edited in the exported Word roadbook are picked up and shown (and spoken) in Travel mode.

### 6.6 Route Library (early access)

A catalogue of routes published by approved authors, searchable by keyword and activity, and loadable into RouteMapper Travel with one tap. Every submission is reviewed before it is published, against a written content policy (legal access only, honest metadata, no private land without permission) and a safety disclaimer that ships with every download.

Today the Library carries free routes only. It is designed to become a marketplace (see §10).

### 6.7 Export package

One ZIP per stage, organised by *what you want to do* rather than by file type. A `README.txt` at the top explains which file to use for which tool.

| Folder | Contents | Use it with |
|---|---|---|
| `Universal/` | `route.gpx` (track + waypoints), `route.kml`, plus separate track and waypoint GPX files | Any GPX/KML tool — Garmin BaseCamp, Hema, Guru Maps, Gaia GPS, Google Earth |
| `RallyNavigator/` | `route.gpx` with OpenRally extensions (distances, headings, tulips) | Rally Navigator — import validated on real recce data, May 2026 |
| `Printable/` | `roadbook.html`, `roadbook.docx`, `roadbook.csv`, `map.pdf` | Print, edit in Word/Pages, open in Excel/Numbers |
| `Source/` | `stage.json`, `roadbook.json`, `manifest.json` | Re-import into RouteMapper or Travel |
| `Garmin/`, `Hema/`, `Gaia/` | Tool-specific bundles | Users who prefer those products' own conventions |

The printable roadbooks include a stage-overview map, a safety warning block and an icon reference page. A printable A4 map PDF can also be produced at any point during a stage.

### 6.8 Accounts, sync and history

- **Guest mode** — open the app and start immediately; everything stays on the device.
- **Free account** — email and password sign-up; stages sync to the cloud and are available on other devices.
- **Offline-first** — recording never depends on a signal. Stages queue on the device and upload automatically when a connection returns; a header indicator shows *Synced*, *Pending*, *Offline* or *Guest*.
- **Stage History** — up to 200 saved stages, each of which can be reopened, re-exported or permanently deleted (from device and cloud), individually or in bulk. Stages can also be imported from a file.

## 7. Devices and platforms

RouteMapper is a **Progressive Web App**: it runs in a web browser, can be added to the home screen to behave like an installed app, and works offline once loaded.

| Device / browser | Status |
|---|---|
| iPad — Safari | Primary target; landscape and portrait; glove-friendly controls |
| iPhone — Safari | Supported (Travel especially) |
| Android phones and tablets — Chrome | Supported; tablet layout polish is planned |
| Mac / PC — Chrome, Edge, Safari | Fully supported; Review mode is designed for laptops |
| Firefox | Works; cannot be installed as an app on mobile |

**Native iOS app — paused.** A packaged App Store version (built with Capacitor) reached a working state in January 2026 — GPS and exports ran natively — but was paused when the voice-recognition plugin proved incompatible with the current iOS build tooling. The web app delivers the same features on iPad and iPhone. The native version will be resumed when the timing and tooling are right.

## 8. Data, privacy and security

- **Where data lives.** Accounts and synced stages are stored in Supabase (managed PostgreSQL) in the **Sydney, Australia** region. Guest-mode data never leaves the device.
- **Who can see it.** Database row-level security means each user can read and change only their own stages. Route Library files are only published after review.
- **Payments.** Card details are handled entirely by Stripe; RouteMapper never sees or stores them. Plan status can only be changed by RouteMapper's server in response to a verified Stripe payment — a security review in August 2026 locked these fields against any change from the app itself.
- **Monitoring.** Crash reports (Sentry) contain error and device details, not personal content. Product-usage analytics (PostHog) measure how features are used, to guide development.
- **Use of data.** Data is used only to provide the service; it is not sold or shared beyond the infrastructure providers needed to run it. Users can ask for their data to be exported or deleted. Full policy: [routemapper.net/privacy.html](https://routemapper.net/privacy.html).
- **Safety.** Printed roadbooks and Library downloads carry a safety disclaimer: routes are records of a past journey, conditions change, and users remain responsible for safe and legal travel.

## 9. Plans and pricing

All prices in Australian dollars, including GST.

| Plan | Price | Includes |
|---|---|---|
| **Free** | A$0 | 1 saved stage · 20 waypoints per stage · core GPX export · cloud sync |
| **Event Pass** | A$39 one-off | One trip · unlimited stages and waypoints · full export package · 60 days from activation |
| **Solo** | A$9.99 / month | Unlimited stages and waypoints · full export package · personal, non-commercial use |
| **Pro** | A$29.99 / month or A$249 / year | Everything in Solo · commercial-use licence · priority email support |

Guest mode and RouteMapper Travel (for following routes) are free. The Event Pass is bought in advance and *activated* when the event begins, so the 60 days start when they are needed.

## 10. Business model and partnership opportunities

**Revenue today**

- Subscriptions (Solo, Pro) and one-off Event Passes, billed through Stripe with Australian GST handled automatically.
- The free tier and guest mode are the on-ramp: the whole workflow can be tried on one stage before paying.

**Revenue designed for next — the Route Library marketplace**

- Approved authors publish routes; buyers pay per route; **the author keeps 60%, RouteMapper keeps 40%**.
- Pricing on a sliding scale by route complexity (stages, distance, waypoints).
- Phased: free catalogue (live) → paid downloads with manual author payouts → author self-submission at scale → automated payouts via Stripe Connect.
- Before any money changes hands, the content policy, safety disclaimer and author terms will be reviewed by a lawyer.
- Following routes stays free, so every buyer can use what they buy without a second charge.

**For event organisers and partners**

- **Entrant roadbooks without the production work.** Record the route, review it, and give every entrant the printed roadbook, the Rally Navigator file and a Travel-ready ZIP from one export.
- **Free for entrants to follow.** Entrants open the roadbook in RouteMapper Travel with no account and no cost.
- **Publish to the Library.** Organisers can become Library authors and, once paid routes launch, earn from their routes after the event.
- RouteMapper welcomes conversations about event pilots, bulk Event Passes, and integrations with timing, tracking or event-management systems.

## 11. Roadmap

**Delivered**

| When | Milestone |
|---|---|
| 2025 | Prototype, field testing on outback recce, invite-only beta with rally recce teams |
| Dec 2025 | Icon selector, simplified voice notes, export overhaul |
| Jan 2026 | Native iOS build reaches working state (then paused) |
| Mar 2026 | Two-row glove-friendly controls, OpenRally GPX, offline sync, turn-detection tuning |
| May 2026 | **Public launch** with Free tier and paid plans · Rally Navigator import validated · push-to-talk voice and external trigger |
| Jun 2026 | Travel mode · Review mode · standalone RouteMapper Travel app · Route Library early access |
| Jul 2026 | GPX import into Travel (follow Rally Navigator routes) |
| Aug 2026 | Travel live map: satellite, track-up, offline map tiles · Event Pass activation · billing security hardening |
| Sep–Oct 2026 | Usage analytics, marketing site and intro video refresh |

**Now** — field hardening of Travel and Review on live recce and event data.

**Next** — Route Library paid downloads (after legal review) · author self-submission at scale.

**Later** — native iOS app (resumed) · Android tablet polish · team collaboration · additional icon packs · partner integrations.

## 12. Known limitations

- **Keep the app in the foreground while recording.** On iPhone and iPad, switching to another app can pause GPS.
- **Voice needs a connection.** Speech-to-text is performed by Apple or Google; tap-based capture works fully offline.
- **Browser support for voice varies.** Best in Safari and Chrome; Microsoft Edge is unreliable; ad-blocking DNS services can block speech services.
- **Very long stages** (1,000+ track points) can be slow to save on older devices.
- **Editing in Word is notes-only.** Rows added or removed in the Word roadbook are not reflected in Travel mode.

## 13. Glossary

| Term | Meaning |
|---|---|
| **Roadbook** | The navigator's book of instructions for a route, one row per instruction |
| **Tulip** | A small diagram showing the shape of a junction and which way to go |
| **CAP** | Compass heading (0–360°) at a roadbook row |
| **Stage** | One continuous recorded section of a route |
| **Recce** | Reconnaissance — driving a route in advance to map it |
| **Waypoint** | A point of interest captured during recording (turn, hazard, control, note) |
| **OpenRally** | An open file convention for rally roadbooks in GPX, used by Rally Navigator and others |
| **GPX / KML** | Standard file formats for GPS tracks and points, read by almost every mapping tool |
| **PWA** | Progressive Web App — a website that can be installed and used offline like an app |

## 14. Contact

- **Product lead:** Roger Saunders
- **Enquiries and partnerships:** [routemapper.net/contact.html](https://routemapper.net/contact.html)
- **Try it:** [app.routemapper.net](https://app.routemapper.net) (guest mode — no sign-up)

---

### Document history

| Edition | Date | Notes |
|---|---|---|
| October 2026 | Oct 2026 | Rewritten from the live product. Adds Review, Travel, RouteMapper Travel, Route Library, current pricing; removes wake-word voice, 2025 pricing tiers and financial projections. |
| v3.1 | Sep 2025 | Dual-mode voice, authentication (archived in `docs/archive/`) |
| v3.0 and earlier | 2025 | Archived in `docs/archive/` |
