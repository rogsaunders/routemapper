// src/roadbook/plannedRoute.js
//
// Roadbook for a PLANNED route (e.g. drawn by hand in Rally Navigator) where
// the waypoints ARE the roadbook rows.
//
// Why a separate path: the normal engine detects turns from a dense recorded
// GPS track. A hand-drawn RN route is a coarse polyline — straight lines
// between a handful of vertices — so the preprocessor collapses it to a few
// points, turn detection has nothing to sample, and most rows vanish
// (a 10-waypoint route came out as 3 rows). Here every waypoint becomes a row:
//   • distance  — RN's own cumulative km (openrally:distance) when present,
//                 otherwise the distance along the polyline
//   • tulip     — bearings in/out taken from the polyline legs either side of
//                 the waypoint, classified with the engine's own thresholds
//   • first / last waypoint → Start / Finish
//
// Output has the same shape as generateRoadbook() so callers can use it
// interchangeably.

import { haversineM, bearingBetweenPoints, normalizeAngle } from "./geo";
import { classifyAngle, describeType } from "./eventClassifier";
import { buildRoadbookViews } from "./roadbookFilter";

// A track is "sparse" (a drawn route, not a recording) when its typical
// point spacing is this large. Recorded tracks are metres apart.
const SPARSE_MEDIAN_SPACING_M = 250;

// A waypoint further than this from every track vertex isn't on the polyline,
// so we can't take bearings from it.
const MAX_SNAP_M = 500;

// Smallest direction change worth calling out at a drawn-route waypoint.
const SHALLOW_BEND_DEG = 8;

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** True when the track is a coarse drawn polyline and waypoints can drive rows. */
export function isPlannedRoute(trackPoints, waypoints) {
  if (!Array.isArray(trackPoints) || trackPoints.length < 2) return false;
  if (!Array.isArray(waypoints) || waypoints.length < 2) return false;
  const gaps = [];
  for (let i = 1; i < trackPoints.length; i++) {
    gaps.push(
      haversineM(
        trackPoints[i - 1].lat,
        trackPoints[i - 1].lon,
        trackPoints[i].lat,
        trackPoints[i].lon,
      ),
    );
  }
  return median(gaps) >= SPARSE_MEDIAN_SPACING_M;
}

function iconFor(eventType) {
  if (eventType === "straight") return "straight";
  return /left/.test(eventType) ? "left" : "right";
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Map markers for a planned-route roadbook — one per row except Start (the
 * map already draws a start marker). Display only; not editable waypoints.
 */
export function markersFromPlannedRoadbook(roadbook) {
  if (roadbook?.config?.mode !== "planned-route") return [];
  return roadbook.rows
    .filter((r) => r.eventType !== "start")
    .map((r) => ({
      id: r.linkedWaypointIds[0],
      lat: r.lat,
      lon: r.lon,
      type: r.icon,
      iconId: r.icon,
      poi: r.notes,
    }));
}

/**
 * @param {{trackPoints:Array, waypoints:Array, meta?:object}} stage
 *   waypoints: [{ lat, lon, distanceFromStartM? }] in route order
 */
export function generatePlannedRoadbook(stage) {
  const track = stage.trackPoints;
  const wps = stage.waypoints;

  // Cumulative polyline distance at each track vertex.
  const cum = [0];
  for (let i = 1; i < track.length; i++) {
    cum.push(
      cum[i - 1] +
        haversineM(
          track[i - 1].lat,
          track[i - 1].lon,
          track[i].lat,
          track[i].lon,
        ),
    );
  }

  // Nearest track vertex for each waypoint.
  const snapped = wps.map((w) => {
    let best = -1;
    let bestM = Infinity;
    for (let i = 0; i < track.length; i++) {
      const d = haversineM(w.lat, w.lon, track[i].lat, track[i].lon);
      if (d < bestM) {
        bestM = d;
        best = i;
      }
    }
    return { idx: bestM <= MAX_SNAP_M ? best : -1 };
  });

  const last = wps.length - 1;
  const events = wps.map((w, i) => {
    const idx = snapped[i].idx;
    const isStart = i === 0;
    const isFinish = i === last;

    let bearingIn = null;
    let bearingOut = null;
    if (idx > 0) bearingIn = bearingBetweenPoints(track[idx - 1], track[idx]);
    if (idx >= 0 && idx < track.length - 1) {
      bearingOut = bearingBetweenPoints(track[idx], track[idx + 1]);
    }
    const hasTurn =
      !isStart && !isFinish && bearingIn != null && bearingOut != null;
    const angle = hasTurn ? normalizeAngle(bearingOut - bearingIn) : null;

    const distanceM =
      Number.isFinite(w.distanceFromStartM) && (w.distanceFromStartM > 0 || isStart)
        ? w.distanceFromStartM
        : idx >= 0
          ? cum[idx]
          : 0;

    let eventType;
    if (isStart) eventType = "start";
    else if (isFinish) eventType = "finish";
    else if (angle == null) eventType = "straight";
    else {
      eventType = classifyAngle(angle);
      // The engine ignores bends under 25° as noise, but a waypoint on a
      // drawn route is a deliberate row — show the shallow direction change.
      if (eventType === "straight" && Math.abs(angle) >= SHALLOW_BEND_DEG) {
        eventType = angle > 0 ? "bear_right" : "bear_left";
      }
    }

    const icon = isStart ? "start" : isFinish ? "finish" : iconFor(eventType);
    const notes = isStart
      ? "Start"
      : isFinish
        ? "Finish"
        : w.note || describeType(eventType);

    return {
      distanceM,
      lat: w.lat,
      lon: w.lon,
      eventType,
      tulipTemplate: eventType,
      bearingIn,
      bearingOut,
      angle,
      icon,
      notes,
      source: "planned",
      confidence: 1,
      linkedWaypointIds: [],
    };
  });

  events.sort((a, b) => a.distanceM - b.distanceM);

  let prev = 0;
  const rows = events.map((e, i) => {
    const row = {
      index: i + 1,
      kmTotal: round3(e.distanceM / 1000),
      kmPartial: round3((e.distanceM - prev) / 1000),
      lat: e.lat,
      lon: e.lon,
      eventType: e.eventType,
      tulipTemplate: e.tulipTemplate,
      bearingIn: e.bearingIn,
      bearingOut: e.bearingOut,
      angle: e.angle,
      icon: e.icon,
      notes: e.notes,
      source: e.source,
      confidence: e.confidence,
      // Ids line up with markersFromPlannedRoadbook() so a map marker and its
      // row select each other in Review Mode.
      linkedWaypointIds: [`gpx-${i + 1}`],
    };
    prev = e.distanceM;
    return row;
  });

  const views = buildRoadbookViews(rows, {});
  return {
    meta: stage.meta,
    config: { mode: "planned-route" },
    stats: {
      rawTrackPoints: track.length,
      processedTrackPoints: track.length,
      candidateCount: 0,
      roadbookRowCount: rows.length,
      driverRowCount: views.driver.length,
    },
    rows,
    views,
  };
}
