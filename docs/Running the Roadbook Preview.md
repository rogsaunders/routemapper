# Running the Roadbook Preview

# **Running the Roadbook Preview *(updated)***

## **Overview**

The preview script takes a roadbook JSON file and generates a self-contained HTML file you can view in Safari.

## **Prerequisites**

- Terminal open at the project root
- A roadbook JSON file exported from RouteMapper

## **Steps**

### **1. Open Terminal and navigate to the project**

`cd ~/routemapper`

### **2. Run the script**

**For HTML**

`~/.nvm/versions/node/v18.20.7/bin/node scripts/regenerate-roadbook.mjs \
  "/Users/Roger/Route Mapper/Road Trips/To Hawker/to-hawker_day1_route1_stage2/RouteMapper_Wakefield_to_Melrose_-_Stage_2_2026-03-23_roadbook.json" \
  /private/tmp/routemapper_preview.html`

> ***Note:** Always wrap the input path in quotes — the folder name contains spaces.*
> 

### **3. Open the output in Safari**

`/private/tmp/routemapper_preview.html`

Or open Safari and press **Cmd+O** to browse to the file.

## **What the Preview Shows**

### **Header**

Three blocks of information across two rows:

- **Row 1 (left):** RouteMapper logo
- **Row 1 (right):** Trip name · Day & Stage · Route name
- **Row 2:** Total kilometres · Waypoints · Start GPS · Finish GPS

### **Warning Block**

Appears directly below the header — visible on screen and when printing. States that the route may involve hazardous conditions and that RouteMapper accepts no responsibility for accuracy or safety.

### **Icon Stash Bar**

Pinned to the top of the screen at all times — stays visible as you scroll through the roadbook. Contains all available icons grouped by category. See *Using the Icon Stash* below.

### **Roadbook Table**

The tulip diagram rows. Click any Note cell to edit text. Drag icons onto tulip cells.

## **Using the Icon Stash**

### **Dropping an icon**

Drag any icon from the stash bar onto a tulip cell. The icon will appear:

- **Centred overlay** (dimming the tulip) — for Hazard, Terrain, and Control icons
- **Corner badge** (bottom-right) — for Nav icons

### **Undoing a drop**

| **Method** | **Action** |
| --- | --- |
| **⌘Z** (Mac) / **Ctrl+Z** (Windows) | Undo last icon drop |
| **↩ Undo button** in the stash bar | Undo last icon drop |

The Undo button is greyed out when there is nothing to undo. Each undo steps back one drop at a time.

### **Removing an icon**

**Double-click** a dropped icon to remove it immediately.

### **Hiding the stash**

Click **Hide** in the stash bar to collapse it. Click **Show** to expand it again. The roadbook content adjusts automatically.

## **Printing**

Press **Cmd+P**. The Icon Stash bar, instructions, and U-turn warnings hide automatically — only the header, warning block, and roadbook table print.

# **Generating the DOCX Roadbook**

## **Overview**

The DOCX script takes a roadbook JSON file and generates a self-contained Word document (.docx) you can open in Microsoft Word or Pages.

## **Steps**

### **1. Open Terminal and navigate to the project**

`cd ~/routemapper`

### **2. Run the script**

`~/.nvm/versions/node/v18.20.7/bin/node scripts/generate-roadbook-docx.cjs \
  "/Users/Roger/Route Mapper/Road Trips/To Hawker/to-hawker_day1_route1_stage2/RouteMapper_Wakefield_to_Melrose_-_Stage_2_2026-03-23_roadbook.json" \
  /private/tmp/routemapper_preview.docx`

### **3. Open the output**

`/private/tmp/routemapper_preview.docx`

Double-click to open in Word or Pages.

## **What the DOCX Contains**

- **Header** — Logo, Trip/Day/Stage/Route, Kilometres, Waypoints, Start and Finish GPS
- **Warning block** — Safety disclaimer
- **Roadbook table** — Tulip diagrams, distances, bearings, notes, GPS
- **Icon Reference page** — All available icons grouped by category

## **Notes**

- Icons in the DOCX are embedded as SVG images
- The document is print-ready at A4 portrait
- No internet connection required — fully self-contained

## **Finding your roadbook JSON files**

Roadbook JSON files are saved by RouteMapper into:

`~/Route Mapper/Road Trips/`

Each stage has its own subfolder containing the `.json` file.

## **Script options**

| **Option** | **Description** |
| --- | --- |
| `--min-confidence <n>` | Only show rows above confidence threshold (default: 0.70) |
| `--no-filter` | Include all rows regardless of confidence |
| `--no-flag-uturns` | Disable U-turn zone highlighting |

---

---

# **Icon Reference**

## **All Icons**

| **ID** | **Label** | **Category** | **File** |
| --- | --- | --- | --- |
| `left` | Left | Nav | `left.svg` |
| `right` | Right | Nav | `right.svg` |
| `keep_l` | Keep Left | Nav | `keep_l.svg` |
| `keep_r` | Keep Right | Nav | `keep_r.svg` |
| `straight` | Straight | Nav | `straight.svg` |
| `on_left` | On Left | Nav | `on_left.svg` |
| `on_right` | On Right | Nav | `on_right.svg` |
| `gate` | Gate | Nav | `gate.svg` |
| `cattle_gate` | Cattle Gate | Nav | `cattle_gate.svg` |
| `Railroad` | railroad | Nav | `railroad.svg` |
| `give_way` | give_way | Nav | `give_way.svg` |
| `caution` | Caution | Nav | `caution.svg` |
| `danger_1` | Danger 1 | Hazard | `danger_1.svg` |
| `danger_2` | Danger 2 | Hazard | `danger_2.svg` |
| `danger_3` | Danger 3 | Hazard | `danger_3.svg` |
| `bump` | Bump | Terrain | `bump.svg` |
| `bumps` | Bumps | Terrain | `bumps.svg` |
| `dip` | Dip | Terrain | `dip.svg` |
| `twisty` | twisty | Terrain | `twisty.svg` |
| `ruts` | Ruts | Terrain | `ruts.svg` |
| `washout` | Washout | Terrain | `washout.svg` |
| `up_hill` | up_hill | Terrain | `up_hill.svg` |
| `down_hill` | down_hill | Terrain | `down_hill.svg` |
| `start` | Start | Control | `start.svg` |
| `finish` | Finish | Control | `finish.svg` |
| `stop` | Stop/Restart | Control | `stop.svg` |
| `checkpoint` | Checkpoint | Control | `checkpoint.svg` |
| `time` | Time Control | Control | `time.svg` |
| `fuel` | Fuel Stop | Control | `fuel.svg` |
| `service` | Service | Control | `service.svg` |
| `speed_25` | Speed 25 | Speed | `speed_25.svg` |
| `speed_40` | Speed 40 | Speed | `speed_40.svg` |
| `speed_50` | Speed 50 | Speed | `speed_50.svg` |
| `speed_60` | Speed 60 | Speed | `speed_60.svg` |
| `speed_80` | Speed 80 | Speed | `speed_80.svg` |
| `speed_100` | Speed 100 | Speed | `speed_100.svg` |
| `speed_110` | Speed 110 | Speed | `speed_110.svg` |
| `note` | Note | Note | `note.svg` |

> *Generated from `src/icons/iconManifest.json` (38 icons, October 2026). The manifest is the source of truth — if they ever disagree, the manifest wins. Regenerate this table when an icon is added.*
> 

## **How Icons Behave by Category**

| **Category** | **Roadbook display** | **App map marker** | **Tulip placement** |
| --- | --- | --- | --- |
| **Hazard** | Centred overlay, tulip dimmed | Map marker | Overlay |
| **Terrain** | Centred overlay, tulip dimmed | Map marker | Overlay |
| **Control** | Centred overlay, tulip dimmed | Map marker | Overlay |
| **Nav** | Corner badge (bottom-right) — except Railroad, Give Way, On Left and On Right, which overlay | Map marker | Badge |
| **Speed** | Centred overlay, tulip dimmed | Map marker | Overlay |
| **Note** | Corner badge | Map marker | Badge |

---