import {
  GoogleMap,
  Marker,
  InfoWindow,
  Polyline,
  Circle,
  useJsApiLoader,
} from "@react-google-maps/api";
import startSound from "./assets/sounds/start.wav";
import stopSound from "./assets/sounds/stop.wav";
import JSZip from "jszip";
import React, { useEffect, useRef, useState } from "react";
import ReplayRoute from "./ReplayRoute";
import { supabase } from "./lib/supabase";
import { dataSync } from "./services/dataSync";
import Auth from "./components/Auth";

// Haversine distance calculator
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2);
}

// Calculate cumulative distance from stage start
function calculateCumulativeDistance(waypoints, currentLat, currentLon) {
  if (waypoints.length === 0) return 0;

  let totalDistance = 0;
  let prevLat = waypoints[0].lat;
  let prevLon = waypoints[0].lon;

  // Sum distances between all previous waypoints
  for (let i = 1; i < waypoints.length; i++) {
    totalDistance += parseFloat(
      calculateDistance(prevLat, prevLon, waypoints[i].lat, waypoints[i].lon)
    );
    prevLat = waypoints[i].lat;
    prevLon = waypoints[i].lon;
  }

  // Add distance from last waypoint to current position
  if (waypoints.length > 0) {
    totalDistance += parseFloat(
      calculateDistance(prevLat, prevLon, currentLat, currentLon)
    );
  }

  return parseFloat(totalDistance.toFixed(2));
}

// The error is likely in the mapCategoryToStandardIcon function
// Here's the corrected version:

function mapCategoryToStandardIcon(category, description) {
  const text = description.toLowerCase();

  // Map categories and keywords to standard rally icons
  const iconMapping = {
    safety: {
      icon: "danger",
      gpxType: "danger",
      priority:
        text.includes("severe") || text.includes("extreme") ? "high" : "medium",
    },
    navigation: {
      icon: text.includes("left")
        ? "left"
        : text.includes("right")
        ? "right"
        : text.includes("straight")
        ? "straight"
        : "navigation",
      gpxType: "turn",
      priority: "high",
    },
    surface: {
      icon: text.includes("bump")
        ? "bump"
        : text.includes("hole")
        ? "hole"
        : text.includes("rough")
        ? "bumpy"
        : "surface",
      gpxType: "hazard",
      priority: "medium",
    },
    obstacle: {
      icon:
        text.includes("grid") || text.includes("cattle")
          ? "grid"
          : text.includes("gate")
          ? "fence-gate"
          : "obstacle",
      gpxType: "waypoint",
      priority: "medium",
    },
    elevation: {
      icon:
        text.includes("summit") || text.includes("peak")
          ? "summit"
          : text.includes("hill")
          ? "uphill"
          : "elevation",
      gpxType: "summit",
      priority: "low",
    },
    crossing: {
      icon: text.includes("bridge")
        ? "bridge"
        : text.includes("water") || text.includes("ford")
        ? "wading"
        : "crossing",
      gpxType: "water",
      priority: "high",
    },
    landmark: {
      icon: "landmark",
      gpxType: "building",
      priority: "low",
    },
    timing: {
      icon: "control",
      gpxType: "checkpoint",
      priority: "high",
    },
  };

  // Ensure this return statement is inside a valid function or component
  return (
    iconMapping[category] || {
      icon: "waypoint",
      gpxType: "waypoint",
      priority: "medium",
    }
  );
}

function buildGPX(waypoints = [], trackingPoints = [], name = "Route") {
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RallyMapper-Voice-v2.0" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>
    <desc>Rally route created with RallyMapper Voice Navigation - ${
      waypoints.length
    } waypoints</desc>
    <author>
      <name>RallyMapper Voice</name>
    </author>
    <time>${new Date().toISOString()}</time>
    <keywords>rally,navigation,voice,waypoints,instructions</keywords>
  </metadata>`;

  // Enhanced waypoints with Rally Navigator specific formatting
  const waypointEntries = waypoints
    .map((wp, index) => {
      const iconInfo = mapCategoryToStandardIcon(
        wp.category || "general",
        wp.name
      );
      const isVoiceCreated = wp.voiceCreated ? " (Voice)" : "";

      // Create instruction-friendly name
      const instructionName = wp.name;
      const waypointNumber = (index + 1).toString().padStart(3, "0");

      // Fix the timestamp issue - create a proper date
      const waypointTime = wp.fullTimestamp
        ? new Date(wp.fullTimestamp).toISOString()
        : new Date().toISOString();

      return `
  <wpt lat="${wp.lat}" lon="${wp.lon}">
    <name>WP${waypointNumber}: ${instructionName}${isVoiceCreated}</name>
    <desc>${instructionName}</desc>
    <cmt>${instructionName} - Distance: ${wp.distance}km${
        wp.speedContext ? " - Speed: " + wp.speedContext : ""
      }</cmt>
    <time>${waypointTime}</time>
    <sym>${iconInfo.icon}</sym>
    <type>${iconInfo.gpxType}</type>
    <extensions>
      <category>${wp.category || "general"}</category>
      <priority>${iconInfo.priority}</priority>
      <voice_created>${wp.voiceCreated || false}</voice_created>
      <rally_icon>${iconInfo.icon}</rally_icon>
      <instruction>${instructionName}</instruction>
      <distance_km>${wp.distance}</distance_km>
      ${
        wp.speedContext
          ? `<speed_context>${wp.speedContext}</speed_context>`
          : ""
      }
      ${
        wp.rawTranscript
          ? `<original_transcript>${wp.rawTranscript}</original_transcript>`
          : ""
      }
      ${
        wp.processedText
          ? `<processed_text>${wp.processedText}</processed_text>`
          : ""
      }
    </extensions>
  </wpt>`;
    })
    .join("");

  // Enhanced route stage with Rally Navigator specific route points
  const routestage =
    waypoints.length > 1
      ? `
  <rte>
    <name>${name} - Rally Instructions</name>
    <desc>Rally navigation route with turn-by-turn instructions - ${
      waypoints.length
    } waypoints - Total distance: ${
          waypoints.length > 0 ? waypoints[waypoints.length - 1].distance : 0
        }km</desc>
    <extensions>
      <total_waypoints>${waypoints.length}</total_waypoints>
      <voice_waypoints>${
        waypoints.filter((wp) => wp.voiceCreated).length
      }</voice_waypoints>
      <creation_date>${new Date().toISOString()}</creation_date>
      <rally_instructions>true</rally_instructions>
    </extensions>
    ${waypoints
      .map((wp, index) => {
        const iconInfo = mapCategoryToStandardIcon(
          wp.category || "general",
          wp.name
        );
        const waypointNumber = (index + 1).toString().padStart(3, "0");

        return `
    <rtept lat="${wp.lat}" lon="${wp.lon}">
      <name>WP${waypointNumber}: ${wp.name}</name>
      <desc>${wp.name}</desc>
      <cmt>${wp.name} - ${wp.distance}km</cmt>
      <sym>${iconInfo.icon}</sym>
      <type>${iconInfo.gpxType}</type>
      <extensions>
        <rally_instruction>${wp.name}</rally_instruction>
        <instruction_text>${wp.name}</instruction_text>
        <distance_from_start>${wp.distance}</distance_from_start>
        <waypoint_category>${wp.category || "general"}</waypoint_category>
        <waypoint_number>${index + 1}</waypoint_number>
        <voice_created>${wp.voiceCreated || false}</voice_created>
      </extensions>
    </rtept>`;
      })
      .join("")}
  </rte>`
      : "";

  // Enhanced tracking with metadata
  const trackingSegment =
    trackingPoints.length > 0
      ? `
  <trk>
    <name>${name} - GPS Track</name>
    <desc>Auto-recorded GPS breadcrumbs - ${trackingPoints.length} points</desc>
    <extensions>
      <track_points>${trackingPoints.length}</track_points>
      <recording_interval>20_seconds</recording_interval>
    </extensions>
    <trkseg>
      ${trackingPoints
        .map(
          (pt) => `
      <trkpt lat="${pt.lat}" lon="${pt.lon}">
        <time>${pt.timestamp || new Date().toISOString()}</time>
      </trkpt>`
        )
        .join("")}
    </trkseg>
  </trk>`
      : "";

  const gpxFooter = `
</gpx>`;

  return gpxHeader + waypointEntries + routestage + trackingSegment + gpxFooter;
}

function buildKML(waypoints = [], trackingPoints = [], name = "Route") {
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <description>Rally route - ${waypoints.length} waypoints</description>
    
    <!-- Waypoint Folder -->
    <Folder>
      <name>Waypoints</name>
      <description>Rally waypoints</description>`;

  // Individual waypoint placemarks
  const waypointPlacemarks = waypoints
    .map(
      (wp, index) => `
      <Placemark>
        <name>WP${(index + 1).toString().padStart(2, "0")} ${wp.name}</name>
        <description>${wp.name} - ${wp.distance}km${
        wp.voiceCreated ? " (Voice)" : ""
      }</description>
        <Point>
          <coordinates>${wp.lon},${wp.lat},0</coordinates>
        </Point>
      </Placemark>`
    )
    .join("");

  const waypointFolderClose = `
    </Folder>`;

  // Tracking folder
  const trackingFolder =
    trackingPoints.length > 0
      ? `
    <Folder>
      <name>GPS Track</name>
      <description>Auto-recorded GPS track</description>
      <Placemark>
        <name>${name} Track</name>
        <description>GPS breadcrumbs - ${
          trackingPoints.length
        } points</description>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>
            ${trackingPoints
              .map((pt) => `${pt.lon},${pt.lat},0`)
              .join("\n            ")}
          </coordinates>
        </LineString>
      </Placemark>
    </Folder>`
      : "";

  return (
    kmlHeader +
    waypointPlacemarks +
    waypointFolderClose +
    trackingFolder +
    `
  </Document>
</kml>`
  );
}

const exportFileIPadCompatible = async (
  content,
  filename,
  mimeType,
  title = "Rally Mapper Export"
) => {
  try {
    const blob = new Blob([content], { type: mimeType });

    // 1) iOS Share Sheet
    if (
      navigator.canShare &&
      navigator.canShare({ files: [new File([""], "t.txt")] })
    ) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        await navigator.share({
          files: [file],
          title,
          text: `Rally route export: ${filename}`,
        });
        return { success: true, method: "share_sheet" };
      } catch {}
    }

    // 2) Direct download
    if ("download" in document.createElement("a")) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      return { success: true, method: "direct_download" };
    }

    // 3) New window
    try {
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return { success: true, method: "new_window" };
      }
    } catch {}

    // 4) Data URL
    try {
      const reader = new FileReader();
      return await new Promise((resolve) => {
        reader.onload = () => {
          const a = document.createElement("a");
          a.href = reader.result;
          a.download = filename;
          a.click();
          resolve({ success: true, method: "data_url" });
        };
        reader.readAsDataURL(blob);
      });
    } catch {}

    throw new Error("All export methods failed");
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const libraries = []; // declared outside the component or at top level
export default function App() {
  const libraries = ["places", "geometry", "drawing"]; // Define the required libraries
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyCYZchsHu_Sd4KMNP1b6Dq30XzWWOuFPO8",
    libraries,
  });
}
  const [routeName, setRouteName] = useState("");
  const [startGPS, setStartGPS] = useState(null);
  const [stage, setstage] = useState([]);
  const [stageSummaries, setstageSummaries] = useState([]);
  const [stageName, setstageName] = useState("Stage 1");
  const [trackingPoints, setTrackingPoints] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [showReplay, setShowReplay] = useState(false);
  const waypointListRef = useRef(null);
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [currentGPS, setCurrentGPS] = useState(null);
  const [showMap, setShowMap] = useState(true);
  const [todayDate, setTodayDate] = useState("");
  const [stageCount, setstageCount] = useState(1);
  const [fullScreenMap, setFullScreenMap] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [stageStarted, setstageStarted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [showEndstageConfirm, setShowEndstageConfirm] = useState(false);
  const [showStartstageConfirm, setShowStartstageConfirm] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [dayRoutes, setDayRoutes] = useState([]); // Track routes per day
  const [currentRoute, setCurrentRoute] = useState(1); // Route number within current day
  // Add these new state variables for inline editing
  const [editingWaypoint, setEditingWaypoint] = useState(null); // Index of waypoint being edited
  const [editValues, setEditValues] = useState({ name: "", poi: "" }); // Temporary edit values
  const [selectedWaypoints, setSelectedWaypoints] = useState(new Set()); // Set of selected waypoint indices
  const [bulkSelectMode, setBulkSelectMode] = useState(false); // Whether bulk selection is active
  // Visual feedback states
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState(null);
  const [waypointAdded, setWaypointAdded] = useState(false);
  const [stageLoading, setstageLoading] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimeLeft, setUndoTimeLeft] = useState(5);
  const [showVoiceInstructions, setShowVoiceInstructions] = useState(false); // Add this state
  // Map enhancement states
  const [mapType, setMapType] = useState("roadmap");
  const [showRouteStats, setShowRouteStats] = useState(false);
  const [mapZoom, setMapZoom] = useState(15);
  const [isFollowingGPS, setIsFollowingGPS] = useState(true); // Start following GPS
  const [staticMapCenter, setStaticMapCenter] = useState(null); // Fixed center when not following
  const [userHasInteractedWithMap, setUserHasInteractedWithMap] =
    useState(false);
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState("offline");

  // Auth session listener (must be top-level)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSyncStatus(session ? "online" : "offline");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setSyncStatus(session ? "online" : "offline");
    });

    return () => subscription.unsubscribe();
  }, []);

  // Autosave when user is logged in and waypoints change (top-level)
  useEffect(() => {
    if (user && waypoints.length > 0) {
      const saveTimer = setTimeout(() => {
        dataSync
          .autoSave({ waypoints, trackingPoints, routeName })
          .then(() => setSyncStatus("synced"))
          .catch(() => setSyncStatus("error"));
      }, 5000);

      return () => clearTimeout(saveTimer);
    }
  }, [user, waypoints, trackingPoints, routeName]);

  useEffect(() => {
    const stored = localStorage.getItem("unsavedWaypoints");
    if (stored) {
      setWaypoints(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("unsavedWaypoints");
    if (saved) setWaypoints(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const geo = navigator.geolocation;
    if (!geo) {
      console.error("Geolocation is not supported.");
      setGpsError("Geolocation is not supported by this device");
      setGpsLoading(false);
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    const handleSuccess = (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const gps = { lat: latitude, lon: longitude };
      setCurrentGPS(gps);
      setGpsAccuracy(accuracy);
      setGpsLoading(false);
      setGpsError(null);
      console.log(
        "📍 GPS Updated:",
        gps.lat.toFixed(6),
        gps.lon.toFixed(6),
        "Accuracy:",
        Math.round(accuracy) + "m"
      );
      // DO NOT force map updates here - let the map component handle it
    };

    const handleError = (err) => {
      console.error("❌ GPS error", err);
      setGpsLoading(false);

      switch (err.code) {
        case err.PERMISSION_DENIED:
          setGpsError(
            "GPS access denied. Please enable location permissions in your browser settings."
          );
          break;
        case err.POSITION_UNAVAILABLE:
          setGpsError(
            "GPS signal unavailable. Try moving to an open area or reloading the page."
          );
          break;
        case err.TIMEOUT:
          setGpsError("GPS timeout. Trying again...");
          setTimeout(() => {
            setGpsLoading(true);
            setGpsError(null);
          }, 2000);
          break;
        default:
          setGpsError(
            `GPS error (${err.code}): ${err.message}. Check your location settings.`
          );
      }
    };

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    };

    geo.getCurrentPosition(handleSuccess, handleError, options);
    const watchId = geo.watchPosition(handleSuccess, handleError, options);

    return () => {
      if (watchId) {
        geo.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    setTodayDate(new Date().toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    if (waypoints.length > 0) {
      localStorage.setItem("unsavedWaypoints", JSON.stringify(waypoints));
    }
  }, [waypoints]);

  useEffect(() => {
    console.log("Waypoints changed:", waypoints);
  }, [waypoints]);

  useEffect(() => {
    if (waypointListRef.current) {
      waypointListRef.current.scrollTop = waypointListRef.current.scrollHeight;
    }
  }, [waypoints]);

  const currentGPSRef = useRef(null);
  useEffect(() => {
    currentGPSRef.current = currentGPS;
  }, [currentGPS]);

  useEffect(() => {
    if (!isTracking) return;
    const interval = setInterval(() => {
      const gps = currentGPSRef.current;
      if (gps?.lat && gps?.lon) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newPoint = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              timestamp: new Date().toISOString(),
            };

            setTrackingPoints((prev) => {
              if (prev.length > 0) {
                const last = prev[prev.length - 1];
                const dist = parseFloat(
                  calculateDistance(
                    last.lat,
                    last.lon,
                    newPoint.lat,
                    newPoint.lon
                  )
                );
                setTotalDistance((td) => parseFloat((td + dist).toFixed(2)));
              }
              return [...prev, newPoint];
            });

            setCurrentGPS({ lat: newPoint.lat, lon: newPoint.lon }); // update live
            console.log("📍 Auto-tracked:", newPoint);
          },
          (err) => console.error("❌ GPS error", err),
          { enableHighAccuracy: true, timeout: 15000 }
        );
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [isTracking, currentGPS?.lat, currentGPS?.lon]);

  useEffect(() => {
    if (!showUndo) return;

    const interval = setInterval(() => {
      setUndoTimeLeft((prev) => {
        if (prev <= 1) {
          setShowUndo(false);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showUndo]);

  const handleNewDay = () => {
    // Show confirmation if there's existing data
    if (waypoints.length > 0 || routeName.trim() !== "") {
      const confirmNewDay = window.confirm(
        `Start Day ${
          currentDay + 1
        }? This will clear all current day data (routes, stages, waypoints). Make sure you've exported your current data first.`
      );

      if (!confirmNewDay) return;
    }

    // Clear all data and increment day
    setCurrentDay((prev) => prev + 1);
    setCurrentRoute(1);
    setRouteName("");
    setWaypoints([]);
    setTrackingPoints([]);
    setstage([]);
    setstageSummaries([]);
    setstageCount(1);
    setstageStarted(false);
    setIsTracking(false);
    setTotalDistance(0);

    // Clear localStorage
    localStorage.removeItem("unsavedWaypoints");

    console.log(`📅 Started Day ${currentDay + 1}`);
  };

  // ← ADD handleNewRoute as a SEPARATE function (outside handleNewDay)
  const handleNewRoute = () => {
    // Show confirmation if there's existing route data
    if (waypoints.length > 0 || routeName.trim() !== "") {
      const confirmNewRoute = window.confirm(
        `Start new route? This will clear current route data (stages, waypoints). Make sure you've exported your current route first.`
      );

      if (!confirmNewRoute) return;
    }

    // Clear route-specific data but keep day
    setCurrentRoute((prev) => prev + 1);
    setRouteName("");
    setWaypoints([]);
    setTrackingPoints([]);
    setstageCount(1); // ← FIXED: lowercase 's'
    setstageStarted(false); // ← FIXED: lowercase 's'
    setIsTracking(false);
    setTotalDistance(0);

    // Clear localStorage
    localStorage.removeItem("unsavedWaypoints");

    console.log(`🗺️ Started Route ${currentRoute + 1} for Day ${currentDay}`);
  };

  const handleAddWaypoint = () => {
    if (!currentGPS) {
      setGpsError("No GPS signal available. Please wait for GPS to be ready.");
      return;
    }

    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    const fullTimestamp = now.toISOString(); // Add this line

    // Calculate cumulative distance from stage start
    const cumulativeDistance = startGPS
      ? calculateCumulativeDistance(waypoints, currentGPS.lat, currentGPS.lon)
      : 0;

    const waypoint = {
      name: "Unnamed",
      lat: currentGPS.lat,
      lon: currentGPS.lon,
      timestamp,
      fullTimestamp, // Add this line
      distance: cumulativeDistance,
      poi: "",
    };
    setWaypoints((prev) => [...prev, waypoint]);

    // Visual feedback for successful waypoint addition
    setWaypointAdded(true);
    setTimeout(() => setWaypointAdded(false), 2000);

    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

    console.log("✅ Waypoint added:", waypoint);

    setShowUndo(true);
    setUndoTimeLeft(5);
  };

  const handleStartstage = () => {
    setstageLoading(true);
    setstageStarted(true);
    setIsTracking(true); // ✅ Start tracking immediately
    setTrackingPoints([]); // ✅ Reset previous tracking points
    setWaypoints([]); // Optional: also reset waypoints if needed
    setTotalDistance(0);
    setIsFollowingGPS(true); // Start following GPS for new stage
    setUserHasInteractedWithMap(false); // Reset interaction flag

    const geo = navigator.geolocation;
    if (!geo) {
      console.error("❌ Geolocation not supported");
      setGpsError("Geolocation not supported on this device");
      setstageLoading(false);
      setRefreshKey((prev) => prev + 1);
      return;
    }

    geo.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const newGPS = { lat: latitude, lon: longitude };
        setStartGPS(newGPS);
        setCurrentGPS(newGPS);

        const stageName = `Day${currentDay}/Route${currentRoute}/Stage${stageCount}`;
        console.log("🔍 Debug stage creation:");
        console.log("- todayDate:", todayDate);
        console.log("- stageCount:", stageCount);
        console.log("- stageName:", stageName);
        setstage((prev) => [...prev, { name: stageName, waypoints: [] }]);
        setstageName(stageName);
        setstageCount((prev) => prev + 1);
        setstageLoading(false);

        console.log("✅ Start stage Initialized:", stageName, newGPS);
      },
      (err) => {
        console.error("❌ Failed to get GPS:", err);
        setGpsError("Failed to get starting GPS position. Please try again.");
        setstageLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 6000 }
    );
  };

  const mapCenter = (() => {
    // If user has interacted with map and we're not following GPS, don't auto-update
    if (!isFollowingGPS && userHasInteractedWithMap) {
      // Map stays where user left it
      return undefined; // Let Google Maps maintain its own position
    }

    // If we're following GPS and have current position, use it
    if (isFollowingGPS && currentGPS) {
      return { lat: currentGPS.lat, lng: currentGPS.lon };
    }

    // Fallback to waypoints or default
    if (waypoints.length > 0) {
      return { lat: waypoints[0].lat, lng: waypoints[0].lon };
    }

    if (currentGPS) {
      return { lat: currentGPS.lat, lng: currentGPS.lon };
    }

    return { lat: -35.0, lng: 138.75 };
  })();

  const handleMapDragStart = () => {
    console.log("🗺️ User dragged map - stopping GPS follow");
    setIsFollowingGPS(false);
    setUserHasInteractedWithMap(true);
  };

  const handleMapDragEnd = () => {
    // Map stays where user dragged it - no need to save position
    console.log("🗺️ Map drag ended - position maintained");
  };

  const recenterOnGPS = () => {
    if (currentGPS) {
      console.log("🎯 Re-centering on current GPS");
      setIsFollowingGPS(true);
      setUserHasInteractedWithMap(false); // Reset interaction flag
      // Force map to recenter by updating key
      setRefreshKey((prev) => prev + 1);
    }
  };

  const handleMapZoomChanged = (map) => {
    if (map) {
      const newZoom = map.getZoom();
      setMapZoom(newZoom);
      // Zooming counts as interaction but doesn't stop GPS follow by itself
      setUserHasInteractedWithMap(true);
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      setRecognitionActive(true);
      // Try to play sound, but don't fail if it doesn't work
      try {
        new Audio(startSound).play().catch((err) => {
          console.log("Audio play prevented:", err.message);
        });
      } catch (err) {
        console.log("Audio not available");
      }
      console.log("🎤 Voice recognition started");
    };

    recognition.onend = () => {
      setRecognitionActive(false);
      // Try to play sound, but don't fail if it doesn't work
      try {
        new Audio(stopSound).play().catch((err) => {
          console.log("Audio play prevented:", err.message);
        });
      } catch (err) {
        console.log("Audio not available");
      }
      console.log("🎤 Voice recognition ended");
    };

    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript;
      console.log("🗣️ Voice input received:", spokenText);
      processVoiceCommand(spokenText);
    };

    recognition.onerror = (event) => {
      console.error("Voice input error:", event.error);
      setRecognitionActive(false);

      let errorMessage = "Voice recognition error.";
      switch (event.error) {
        case "no-speech":
          errorMessage = "No speech detected. Try again.";
          break;
        case "audio-capture":
          errorMessage = "Microphone access error.";
          break;
        case "not-allowed":
          errorMessage = "Microphone permission denied.";
          break;
      }

      setGpsError(errorMessage);
      setTimeout(() => setGpsError(null), 500);
    };

    recognition.start();
  };

  const handleGlobalVoiceCommands = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      setRecognitionActive(true);
      new Audio(startSound).play();
      console.log("🎤 Global voice recognition started");
    };

    recognition.onend = () => {
      setRecognitionActive(false);
      new Audio(stopSound).play();
      console.log("🎤 Global voice recognition ended");
    };

    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript;
      console.log("🗣️ Global voice input received:", spokenText);

      processGlobalVoiceCommand(spokenText);
    };

    recognition.onerror = (event) => {
      console.error("Global voice input error:", event.error);
      setRecognitionActive(false);

      let errorMessage = "Voice recognition error.";
      switch (event.error) {
        case "no-speech":
          errorMessage = "No speech detected. Try again.";
          break;
        case "audio-capture":
          errorMessage = "Microphone access error.";
          break;
        case "not-allowed":
          errorMessage = "Microphone permission denied.";
          break;
      }

      setGpsError(errorMessage);
      setTimeout(() => setGpsError(null), 1000);
    };

    recognition.start();
  };

  const processGlobalVoiceCommand = (transcript) => {
    const cleanText = transcript.trim().toLowerCase();
    console.log("🗣️ Processing global command:", cleanText);

    // Handle stage start command (works before stage starts)
    if (
      cleanText.includes("stage start") ||
      cleanText.includes("start stage")
    ) {
      if (waypoints.length > 0) {
        setShowStartstageConfirm(true);
      } else {
        handleStartstage();
      }
      return;
    }

    // Handle stage end command (only works during stage)
    if (cleanText.includes("stage end") || cleanText.includes("end stage")) {
      if (stageStarted) {
        setShowEndstageConfirm(true);
      } else {
        setGpsError("No active stage to end.");
        setTimeout(() => setGpsError(null), 1000);
      }
      return;
    }

    // If stage is started, use normal voice processing
    if (stageStarted) {
      processVoiceCommand(transcript);
    } else {
      setGpsError("Start a stage first to add waypoints.");
      setTimeout(() => setGpsError(null), 1000);
    }
  };

  const detectCategory = (description) => {
    const text = description.toLowerCase();

    // Multi-word pattern matching for better accuracy
    const patterns = {
      safety: [
        /danger|hazard|warning|careful|watch|avoid|risk|unsafe/,
        /severe|extreme|major|critical|emergency/,
        /washout|bridge out|road closed|blocked/,
      ],
      navigation: [
        /left|right|straight|turn|continue|bear|veer|fork|junction/,
        /onto|into|towards|follow|take|keep/,
        /road|track|path|lane|route/,
      ],
      surface: [
        /bump|hole|rough|smooth|gravel|tarmac|concrete|dirt|mud|sand|washout|rut/,
        /sealed|unsealed|bitumen|metal|loose|firm|soft|hard/,
        /surface|condition|texture/,
      ],
      obstacle: [
        /grid|gate|cattle|fence|barrier|bollard|post|sign/,
        /wire|electric|wooden|metal|stock/,
      ],
      elevation: [
        /hill|summit|peak|climb|descent|steep|uphill|downhill|crest|ridge/,
        /up|down|rise|fall|gradient|slope/,
      ],
      crossing: [
        /bridge|water|ford|creek|river|stream|crossing|splash/,
        /culvert|causeway|low water/,
      ],
      landmark: [
        /house|building|shed|barn|tower|mast|church|pub|shop|station/,
        /tank|silo|windmill|monument|marker/,
      ],
      timing: [
        /start|finish|checkpoint|control|timing|stage/,
        /stop|restart|neutralisation/,
      ],
    };

    // Score each category based on pattern matches
    let bestCategory = "general";
    let bestScore = 0;

    for (const [category, categoryPatterns] of Object.entries(patterns)) {
      let score = 0;
      for (const pattern of categoryPatterns) {
        if (pattern.test(text)) {
          score += text.match(pattern) ? text.match(pattern).length : 0;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    console.log(
      `📂 Category detected: "${text}" → ${bestCategory} (score: ${bestScore})`
    );
    return bestCategory;
  };

  const smartTextCorrection = (rawText) => {
    let corrected = rawText.toLowerCase().trim();

    // Common voice recognition errors for rally terms
    const corrections = {
      // Direction corrections
      write: "right",
      wright: "right",
      rite: "right",
      lift: "left",
      laugh: "left",
      strait: "straight",
      "straight ahead": "straight",

      // Rally-specific corrections
      grade: "grid",
      great: "grid",
      greed: "grid",
      "cattle guard": "grid",
      "cattle grid": "grid",
      summary: "summit",
      submit: "summit",
      sumit: "summit",
      caution: "caution",
      cation: "caution",
      washout: "washout",
      "wash out": "washout",
      wash: "washout",

      // Surface corrections
      "gravel road": "gravel",
      "tarmac road": "tarmac",
      "sealed road": "tarmac",
      "dirt road": "dirt",
      unsealed: "gravel",

      // Distance/measurement corrections
      "next to k": "next 2k",
      "next 2 k": "next 2k",
      "next two k": "next 2k",
      "for 1k": "for 1k",
      "for one k": "for 1k",

      // Common rally phrases
      "turn left": "left turn",
      "turn right": "right turn",
      "keep going left": "keep left",
      "keep going right": "keep right",
      "carry straight": "keep straight",
      "continue straight": "keep straight",
    };

    // Apply corrections
    for (const [wrong, right] of Object.entries(corrections)) {
      corrected = corrected.replace(new RegExp(wrong, "gi"), right);
    }

    return corrected;
  };

  const expandRallyTerms = (text) => {
    let expanded = text;

    // Common rally abbreviations and expansions
    const expansions = {
      // Directional
      l: "left",
      r: "right",
      str: "straight",
      kr: "keep right",
      kl: "keep left",
      ks: "keep straight",

      // Rally features
      cg: "cattle grid",
      wg: "wire gate",
      fg: "fence gate",
      br: "bridge",
      fd: "ford",
      xing: "crossing",

      // Surfaces
      gr: "gravel",
      tar: "tarmac",
      conc: "concrete",
      dt: "dirt",
      rgh: "rough",
      sth: "smooth",

      // Hazards
      dngr: "danger",
      caut: "caution",
      bump: "bump",
      hole: "hole",
      wo: "washout",

      // Distances (preserve these exactly)
      "1k": "1k",
      "2k": "2k",
      "3k": "3k",
      "4k": "4k",
      "5k": "5k",
    };

    // Apply expansions (whole words only)
    for (const [abbrev, full] of Object.entries(expansions)) {
      const regex = new RegExp(`\\b${abbrev}\\b`, "gi");
      expanded = expanded.replace(regex, full);
    }

    return expanded;
  };

  const getSpeedContext = () => {
    // Calculate current speed from recent tracking points
    if (trackingPoints.length < 2) return "unknown";

    const recent = trackingPoints.slice(-2);
    const timeDiff =
      (new Date(recent[1].timestamp) - new Date(recent[0].timestamp)) / 1000; // seconds
    const distance =
      parseFloat(
        calculateDistance(
          recent[0].lat,
          recent[0].lon,
          recent[1].lat,
          recent[1].lon
        )
      ) * 1000; // meters

    const speedMPS = distance / timeDiff; // meters per second
    const speedKMH = speedMPS * 3.6; // km/h

    if (speedKMH > 80) return "fast";
    if (speedKMH > 40) return "medium";
    if (speedKMH > 10) return "slow";
    return "stationary";
  };

  const contextualProcessing = (text, speed) => {
    let processed = text;

    switch (speed) {
      case "fast":
        // High speed - prefer brief, essential info
        processed = processed
          .replace(/followed by/g, "→")
          .replace(/next stage/g, "next")
          .replace(/approximately/g, "~");
        break;

      case "medium":
        // Medium speed - standard processing
        break;

      case "slow":
        // Low speed - can handle detailed descriptions
        processed = processed
          .replace(/→/g, "followed by")
          .replace(/~/g, "approximately");
        break;

      default:
        // Unknown speed - standard processing
        break;
    }

    return processed;
  };

  const processVoiceCommand = (transcript) => {
    const cleanText = transcript.trim();
    console.log("🗣️ Voice input:", cleanText);

    // Check for special commands first
    if (cleanText.toLowerCase().includes("undo")) {
      handleUndoLastWaypoint();
      return;
    }

    if (
      cleanText.toLowerCase().includes("stage start") ||
      cleanText.toLowerCase().includes("start stage")
    ) {
      handleStartstage();
      return;
    }

    if (
      cleanText.toLowerCase().includes("stage end") ||
      cleanText.toLowerCase().includes("end stage")
    ) {
      setShowEndstageConfirm(true);
      return;
    }

    // Everything else becomes a waypoint with natural description
    handleNaturalWaypoint(cleanText);
  };

  const handleNaturalWaypoint = (description) => {
    if (!currentGPS) {
      setGpsError("No GPS signal available for waypoint.");
      return;
    }

    if (!description || description.trim().length < 2) {
      setGpsError("Please provide a waypoint description.");
      return;
    }

    // Step 1: Smart corrections for voice recognition errors
    const corrected = smartTextCorrection(description);
    const expanded = expandRallyTerms(corrected);
    const speed = getSpeedContext();
    const contextual = contextualProcessing(expanded, speed);
    const formattedName =
      contextual.charAt(0).toUpperCase() + contextual.slice(1);

    console.log(
      `🧠 Smart processing: "${description}" → "${formattedName}" (speed: ${speed})`
    );

    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    const fullTimestamp = now.toISOString(); // Add this line

    const cumulativeDistance = startGPS
      ? calculateCumulativeDistance(waypoints, currentGPS.lat, currentGPS.lon)
      : 0;

    const waypoint = {
      name: formattedName,
      lat: currentGPS.lat,
      lon: currentGPS.lon,
      timestamp,
      fullTimestamp, // Add this line
      distance: cumulativeDistance,
      poi: "",
      iconSrc: "",
      category: detectCategory(formattedName),
      voiceCreated: true,
      rawTranscript: description,
      processedText: formattedName,
      speedContext: speed,
    };

    setWaypoints((prev) => [...prev, waypoint]);

    // Visual and haptic feedback
    setWaypointAdded(true);
    setTimeout(() => setWaypointAdded(false), 2000);
    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

    // Show undo option
    setShowUndo(true);
    setUndoTimeLeft(5);
  };

  const startEditingWaypoint = (index) => {
    setEditingWaypoint(index);
    setEditValues({
      name: waypoints[index].name,
      poi: waypoints[index].poi || "",
    });
  };

  const saveWaypointEdit = () => {
    if (editingWaypoint === null) return;

    setWaypoints((prev) => {
      const updated = [...prev];
      updated[editingWaypoint] = {
        ...updated[editingWaypoint],
        name: editValues.name.trim() || "Unnamed",
        poi: editValues.poi.trim(),
      };
      return updated;
    });

    setEditingWaypoint(null);
    setEditValues({ name: "", poi: "" });

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate([30]);

    console.log("✅ Waypoint edited");
  };

  const cancelWaypointEdit = () => {
    setEditingWaypoint(null);
    setEditValues({ name: "", poi: "" });
  };

  const handleEditKeyPress = (e) => {
    if (e.key === "Enter") {
      saveWaypointEdit();
    } else if (e.key === "Escape") {
      cancelWaypointEdit();
    }
  };

  const toggleBulkSelectMode = () => {
    setBulkSelectMode(!bulkSelectMode);
    setSelectedWaypoints(new Set()); // Clear selections when toggling mode
  };

  const toggleWaypointSelection = (index) => {
    setSelectedWaypoints((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const selectAllWaypoints = () => {
    if (selectedWaypoints.size === waypoints.length) {
      // If all selected, deselect all
      setSelectedWaypoints(new Set());
    } else {
      // Select all waypoints
      setSelectedWaypoints(new Set(waypoints.map((_, index) => index)));
    }
  };

  const deleteSelectedWaypoints = () => {
    if (selectedWaypoints.size === 0) return;

    // Show confirmation
    const confirmDelete = window.confirm(
      `Delete ${selectedWaypoints.size} selected waypoint${
        selectedWaypoints.size !== 1 ? "s" : ""
      }? This cannot be undone.`
    );

    if (!confirmDelete) return;

    // Remove selected waypoints (in reverse order to maintain indices)
    const indicesToDelete = Array.from(selectedWaypoints).sort((a, b) => b - a);

    setWaypoints((prev) => {
      let updated = [...prev];
      indicesToDelete.forEach((index) => {
        updated.splice(index, 1);
      });
      return updated;
    });

    // Clear selections and exit bulk mode
    setSelectedWaypoints(new Set());
    setBulkSelectMode(false);

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

    console.log(`🗑️ Deleted ${selectedWaypoints.size} waypoints`);
  };

  // MISSING FUNCTION - Add this back to your App.jsx

  const handleUndoLastWaypoint = () => {
    if (waypoints.length === 0) return;

    // Remove last waypoint
    setWaypoints((prev) => prev.slice(0, -1));

    // Hide undo option
    setShowUndo(false);
    setUndoTimeLeft(5);

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

    console.log("↩️ Last waypoint undone");
  };

  const exportAsJSON = async (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "stage"
  ) => {
    try {
      console.log("🔍 Starting Enhanced JSON export (iPad compatible)...");

      const voiceWaypoints = waypointsData.filter(
        (wp) => wp.voiceCreated
      ).length;
      const categories = waypointsData.reduce((acc, wp) => {
        acc[wp.category || "general"] =
          (acc[wp.category || "general"] || 0) + 1;
        return acc;
      }, {});

      const data = {
        metadata: {
          routeName: routeName || name,
          stageName: stageName,
          exportDate: new Date().toISOString(),
          appVersion: "RallyMapper-Voice-v2.0",
          totalWaypoints: waypointsData.length,
          voiceWaypoints: voiceWaypoints,
          manualWaypoints: waypointsData.length - voiceWaypoints,
          totalDistance:
            waypointsData.length > 0
              ? waypointsData[waypointsData.length - 1].distance
              : 0,
          categories: categories,
          hasTracking: trackingData.length > 0,
          trackingPoints: trackingData.length,
        },
        waypoints: waypointsData.map((wp, index) => ({
          id: index + 1,
          name: wp.name,
          coordinates: { lat: wp.lat, lon: wp.lon, accuracy: gpsAccuracy },
          timing: { timestamp: wp.timestamp, distanceFromStart: wp.distance },
          classification: {
            category: wp.category || "general",
            priority: mapCategoryToStandardIcon(
              wp.category || "general",
              wp.name
            ).priority,
            rallyIcon: mapCategoryToStandardIcon(
              wp.category || "general",
              wp.name
            ).icon,
          },
          creation: {
            method: wp.voiceCreated ? "voice" : "manual",
            rawTranscript: wp.rawTranscript || null,
            processedText: wp.processedText || wp.name,
            speedContext: wp.speedContext || null,
          },
          notes: wp.poi || null,
        })),
        tracking: {
          enabled: trackingData.length > 0,
          points: trackingData,
          interval: "20_seconds",
          totalPoints: trackingData.length,
        },
        compatibility: {
          rallyNavigator: true,
          googleEarth: true,
          garminDevices: true,
          hema: true,
          standardGPX: true,
        },
      };

      const content = JSON.stringify(data, null, 2);
      const result = await exportFileIPadCompatible(
        content,
        `${name}-enhanced.json`,
        "application/json",
        "Rally Mapper Enhanced JSON"
      );

      console.log("Enhanced JSON export result:", result);
      return result;
    } catch (error) {
      console.error("❌ Enhanced JSON export failed:", error);
      throw error;
    }
  };

  const exportAsSimpleJSON = async (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "stage"
  ) => {
    try {
      console.log("🔍 Starting Simple JSON export (iPad compatible)...");

      const data = {
        name: routeName || name,
        stageName: stageName,
        date: new Date().toISOString(),
        waypoints: waypointsData.map((wp, index) => ({
          name: wp.name,
          lat: wp.lat,
          lon: wp.lon,
          distance: wp.distance,
          timestamp: wp.timestamp,
          description: wp.name + (wp.voiceCreated ? " (Voice)" : ""),
        })),
        track:
          trackingData.length > 0
            ? {
                name: `${name} Track`,
                points: trackingData.map((pt) => ({
                  lat: pt.lat,
                  lon: pt.lon,
                  timestamp: pt.timestamp,
                })),
              }
            : null,
      };

      const content = JSON.stringify(data, null, 2);
      const result = await exportFileIPadCompatible(
        content,
        `${name}-simple.json`,
        "application/json",
        "Rally Mapper Simple JSON"
      );

      console.log("Simple JSON export result:", result);
      return result;
    } catch (error) {
      console.error("❌ Simple JSON export failed:", error);
      throw error;
    }
  };

  const exportAsGPX = async (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "route"
  ) => {
    try {
      console.log("🔍 Starting GPX export (iPad compatible)...");

      const gpxContent = buildGPX(waypointsData, trackingData, name);
      console.log("🔍 GPX content length:", gpxContent.length);

      // ✅ USE IPAD-COMPATIBLE HELPER (this was missing!)
      const result = await exportFileIPadCompatible(
        gpxContent,
        `${name}.gpx`,
        "application/gpx+xml",
        "Rally Mapper GPX Export"
      );

      console.log("GPX export result:", result);
      return result;
    } catch (error) {
      console.error("❌ GPX export failed:", error);
      throw error;
    }
  };

  const exportAsRallyNavigatorGPX = async (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "route"
  ) => {
    try {
      console.log(
        "🔍 Starting Rally Navigator GPX export (iPad compatible)..."
      );

      // Rally Navigator optimized GPX structure
      const rallyGPX = `<?xml version="1.0" encoding="UTF-8"?>
  <gpx version="1.1" creator="RallyMapper-Voice" xmlns="http://www.topografix.com/GPX/1/1">
    <metadata>
      <name>${name}</name>
      <desc>Rally route with voice instructions - ${
        waypointsData.length
      } waypoints</desc>
      <time>${new Date().toISOString()}</time>
    </metadata>
    
    <!-- Waypoints with Rally Navigator friendly format -->
    ${waypointsData
      .map((wp, index) => {
        const waypointNumber = (index + 1).toString().padStart(3, "0");
        return `
    <wpt lat="${wp.lat}" lon="${wp.lon}">
      <name>${waypointNumber} - ${wp.name}</name>
      <desc>${wp.name}</desc>
      <cmt>Rally instruction: ${wp.name} at ${wp.distance}km</cmt>
      <type>waypoint</type>
    </wpt>`;
      })
      .join("")}
  
    <!-- Route with turn instructions -->
    <rte>
      <name>${name} Instructions</name>
      <desc>Rally route with ${waypointsData.length} instruction points</desc>
      ${waypointsData
        .map((wp, index) => {
          const waypointNumber = (index + 1).toString().padStart(3, "0");
          return `
      <rtept lat="${wp.lat}" lon="${wp.lon}">
        <name>${waypointNumber} - ${wp.name}</name>
        <desc>${wp.name}</desc>
        <cmt>${wp.name}</cmt>
      </rtept>`;
        })
        .join("")}
    </rte>
  
    ${
      trackingData.length > 0
        ? `
    <!-- GPS Track -->
    <trk>
      <name>${name} Track</name>
      <trkseg>
        ${trackingData
          .map(
            (pt) => `
        <trkpt lat="${pt.lat}" lon="${pt.lon}">
          <time>${pt.timestamp || new Date().toISOString()}</time>
        </trkpt>`
          )
          .join("")}
      </trkseg>
    </trk>`
        : ""
    }
  </gpx>`;

      // ✅ USE IPAD-COMPATIBLE HELPER
      const result = await exportFileIPadCompatible(
        rallyGPX,
        `${name}.gpx`,
        "application/gpx+xml",
        "Rally Mapper GPX Export"
      );

      console.log("Rally Navigator GPX export result:", result);
      return result;
    } catch (error) {
      console.error("❌ Rally Navigator GPX export failed:", error);
      throw error;
    }
  };

  // (Removed stray inline JSX button block that broke parsing)

  const exportAsKML = async (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "route"
  ) => {
    try {
      console.log("🔍 Starting KML export (iPad compatible)...");

      const kmlContent = buildKML(waypointsData, trackingData, name);
      const result = await exportFileIPadCompatible(
        kmlContent,
        `${name}.kml`,
        "application/vnd.google-earth.kml+xml",
        "Rally Mapper KML Export"
      );

      console.log("KML export result:", result);
      return result;
    } catch (error) {
      console.error("❌ KML export failed:", error);
      throw error;
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading Rally Mapper...</p>
        </div>
      </div>
    );
  };

  if (gpsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-pulse rounded-full h-12 w-12 bg-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Acquiring GPS signal...</p>
          <p className="text-sm text-gray-500">
            Please ensure location services are enabled
          </p>
        </div>
      </div>
    );
  }

  // Create polyline path from waypoints for route visualization
  const routePath = waypoints.map((wp) => ({
    lat: wp.lat,
    lng: wp.lon,
  }));

  // Calculate route statistics
  const routeDistance =
    waypoints.length > 0 ? waypoints[waypoints.length - 1].distance : 0;
  const routeStats = {
    totalWaypoints: waypoints.length,
    routeDistance: routeDistance,
    avgSpeed:
      isTracking && trackingPoints.length > 1
        ? (
            routeDistance /
            ((Date.now() - new Date(trackingPoints[0].timestamp).getTime()) /
              3600000)
          ).toFixed(1)
        : 0,
    duration:
      trackingPoints.length > 0
        ? (
            (Date.now() - new Date(trackingPoints[0].timestamp).getTime()) /
            60000
          ).toFixed(1)
        : 0,
  };

  // Map type options
  const mapTypes = [
    { key: "roadmap", label: "Road", icon: "🗺️" },
    { key: "satellite", label: "Satellite", icon: "🛰️" },
    { key: "terrain", label: "Terrain", icon: "⛰️" },
    { key: "hybrid", label: "Hybrid", icon: "🔀" },
  ];

  // GPS Status Component
  const GPSStatus = () => {
    if (gpsError) {
      return (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">⚠️</span>
            <div className="flex-1">
              <strong>GPS Error:</strong> {gpsError}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="ml-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (gpsLoading || !currentGPS?.lat || !currentGPS?.lon) {
      return (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
            <span>Acquiring GPS signal... Please wait.</span>
          </div>
        </div>
      );
    }

    return (
      <div className="app min-h-screen bg-gray-50">
        {/* Status notifications */}
        <GPSStatus />
        <WaypointSuccessNotification />
        
        {/* Header with route controls */}
        <div className="bg-white shadow-sm p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Day and Route Info */}
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-800">
                Rally Mapper Voice - Day {currentDay}, Route {currentRoute}
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={handleNewDay}
                  className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600"
                >
                  New Day
                </button>
                <button
                  onClick={handleNewRoute}
                  className="px-3 py-1 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
                >
                  New Route
                </button>
              </div>
            </div>
  
            {/* Sync Status */}
            {user !== "guest" && (
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    syncStatus === "synced"
                      ? "bg-green-500"
                      : syncStatus === "syncing"
                      ? "bg-yellow-500 animate-pulse"
                      : syncStatus === "error"
                      ? "bg-red-500"
                      : "bg-gray-400"
                  }`}
                />
                <span className="text-sm text-gray-600 capitalize">
                  {syncStatus === "synced" ? "Cloud Synced" : syncStatus}
                </span>
              </div>
            )}
          </div>
  
          {/* Route Name Input */}
          <div className="mt-4">
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Enter route name..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
  
          {/* Stage Controls */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={stageStarted ? () => setShowStartstageConfirm(true) : handleStartstage}
              disabled={stageLoading}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                stageLoading
                  ? "bg-gray-400 cursor-not-allowed"
                  : stageStarted
                  ? "bg-orange-500 hover:bg-orange-600"
                  : "bg-green-500 hover:bg-green-600"
              } text-white`}
            >
              {stageLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Starting...
                </div>
              ) : stageStarted ? (
                `End ${stageName}`
              ) : (
                `Start ${stageName}`
              )}
            </button>
  
            {stageStarted && (
              <button
                onClick={() => setShowEndstageConfirm(true)}
                className="px-4 py-2 bg-red-500 text-white rounded font-medium hover:bg-red-600"
              >
                End Stage & Export
              </button>
            )}
  
            <button
              onClick={() => setShowVoiceInstructions(!showVoiceInstructions)}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                showVoiceInstructions
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Voice Help
            </button>
          </div>
  
          {/* Voice Instructions - Collapsible */}
          {showVoiceInstructions && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">Voice Commands</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-blue-700">Stage Control:</h4>
                  <ul className="text-blue-600 mt-1 space-y-1">
                    <li>• "Stage start" - Begin new stage</li>
                    <li>• "Stage end" - End current stage</li>
                    <li>• "Undo" - Remove last waypoint</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-blue-700">Navigation Examples:</h4>
                  <ul className="text-blue-600 mt-1 space-y-1">
                    <li>• "Left turn in 2k"</li>
                    <li>• "Cattle grid ahead"</li>
                    <li>• "Rough surface for 1k"</li>
                    <li>• "Bridge over creek"</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
  
        {/* Map Section */}
        {showMap && (
          <div className="mb-4">
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b">
                <h2 className="text-lg font-semibold">Live Map View</h2>
                <div className="flex gap-2">
                  <button
                    onClick={recenterOnGPS}
                    disabled={!currentGPS}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      isFollowingGPS
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    GPS Follow: {isFollowingGPS ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => setFullScreenMap(!fullScreenMap)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    {fullScreenMap ? "Exit Fullscreen" : "Fullscreen"}
                  </button>
                </div>
              </div>
              
              <div
                className="relative"
                style={{
                  height: fullScreenMap ? "80vh" : "50vh",
                  minHeight: "300px",
                }}
              >
                <GoogleMap
                  key={refreshKey}
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  center={mapCenter}
                  zoom={mapZoom}
                  mapTypeId={mapType}
                  onDragStart={handleMapDragStart}
                  onDragEnd={handleMapDragEnd}
                  onZoomChanged={(map) => handleMapZoomChanged(map)}
                  options={{
                    zoomControl: true,
                    mapTypeControl: false,
                    scaleControl: true,
                    streetViewControl: false,
                    rotateControl: true,
                    fullscreenControl: false,
                    gestureHandling: "greedy",
                  }}
                >
                  {/* Current GPS Position */}
                  {currentGPS && (
                    <Marker
                      position={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                      icon={{
                        url: "data:image/svg+xml," + encodeURIComponent(`
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="8" fill="#3B82F6" stroke="white" stroke-width="2"/>
                            <circle cx="10" cy="10" r="3" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new window.google.maps.Size(20, 20),
                        anchor: new window.google.maps.Point(10, 10),
                      }}
                      title="Your current location"
                    />
                  )}
  
                  {/* GPS Accuracy Circle */}
                  {currentGPS && gpsAccuracy && (
                    <Circle
                      center={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                      radius={gpsAccuracy}
                      options={{
                        fillColor: "#3B82F6",
                        fillOpacity: 0.1,
                        strokeColor: "#3B82F6",
                        strokeOpacity: 0.3,
                        strokeWeight: 1,
                      }}
                    />
                  )}
  
                  {/* Waypoint Markers */}
                  {waypoints.map((wp, index) => (
                    <Marker
                      key={index}
                      position={{ lat: wp.lat, lng: wp.lon }}
                      title={`${index + 1}: ${wp.name}`}
                      icon={{
                        url: "data:image/svg+xml," + encodeURIComponent(`
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" fill="${wp.voiceCreated ? '#EF4444' : '#10B981'}" stroke="white" stroke-width="2"/>
                            <text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${index + 1}</text>
                          </svg>
                        `),
                        scaledSize: new window.google.maps.Size(24, 24),
                        anchor: new window.google.maps.Point(12, 12),
                      }}
                      onClick={() => setSelectedWaypoint(selectedWaypoint === index ? null : index)}
                    />
                  ))}
  
                  {/* Info Window for Selected Waypoint */}
                  {selectedWaypoint !== null && waypoints[selectedWaypoint] && (
                    <InfoWindow
                      position={{
                        lat: waypoints[selectedWaypoint].lat,
                        lng: waypoints[selectedWaypoint].lon,
                      }}
                      onCloseClick={() => setSelectedWaypoint(null)}
                    >
                      <div className="p-2">
                        <h3 className="font-bold">{waypoints[selectedWaypoint].name}</h3>
                        <p className="text-sm">Distance: {waypoints[selectedWaypoint].distance} km</p>
                        <p className="text-sm">Time: {waypoints[selectedWaypoint].timestamp}</p>
                        {waypoints[selectedWaypoint].poi && (
                          <p className="text-sm mt-1">POI: {waypoints[selectedWaypoint].poi}</p>
                        )}
                      </div>
                    </InfoWindow>
                  )}
  
                  {/* Route Path */}
                  {routePath.length > 1 && (
                    <Polyline
                      path={routePath}
                      options={{
                        strokeColor: "#DC2626",
                        strokeOpacity: 0.8,
                        strokeWeight: 3,
                      }}
                    />
                  )}
  
                  {/* Tracking Path */}
                  {trackingPoints.length > 1 && (
                    <Polyline
                      path={trackingPoints.map((pt) => ({ lat: pt.lat, lng: pt.lon }))}
                      options={{
                        strokeColor: "#059669",
                        strokeOpacity: 0.6,
                        strokeWeight: 2,
                        strokeDasharray: "10,5",
                      }}
                    />
                  )}
  
                  {/* Map Controls */}
                  <MapControls />
                  
                  {/* Route Stats Overlay */}
                  <RouteStatsOverlay />
                </GoogleMap>
              </div>
            </div>
          </div>
        )}
  
        {/* Main Controls Section */}
        <div className="bg-white shadow-sm rounded-lg p-4 mb-4">
          {/* Waypoint Entry Controls */}
          <div className="flex justify-center items-center gap-4 my-4 flex-wrap">
            {/* Distance Display */}
            <div className="w-32 h-16 flex flex-col items-center justify-center bg-white border-2 border-blue-800 rounded-lg font-bold shadow-md p-4">
              <span className="text-2xl text-center leading-tight">
                {totalDistance.toFixed(2)} km
              </span>
            </div>
  
            {/* Add Waypoint Button */}
            <button
              onClick={handleAddWaypoint}
              type="button"
              disabled={!currentGPS || !stageStarted}
              className={`px-6 py-4 rounded-lg text-lg font-medium transition-all flex items-center gap-2 border-2 border-blue-800 ${
                !currentGPS || !stageStarted
                  ? "bg-orange-400 cursor-not-allowed"
                  : waypointAdded
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-green-500 hover:bg-green-600"
              } text-white shadow-md`}
            >
              {waypointAdded ? "Added!" : "Add Waypoint"}
            </button>
  
            {/* Voice Input Button */}
            <button
              onClick={stageStarted ? startVoiceInput : handleGlobalVoiceCommands}
              type="button"
              disabled={!stageStarted}
              className={`px-6 py-4 rounded-lg text-lg font-medium transition-all flex items-center gap-3 border-2 border-blue-800 shadow-md ${
                !stageStarted
                  ? "bg-orange-400 cursor-not-allowed"
                  : recognitionActive
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
              } text-white`}
            >
              {recognitionActive ? (
                <>
                  <div className="w-4 h-4 bg-white rounded-full animate-pulse" />
                  Listening...
                </>
              ) : (
                "Add Location"
              )}
            </button>
  
            {/* Photo Button */}
            <button
              onClick={() => alert("Photo feature not yet implemented")}
              type="button"
              disabled={!stageStarted}
              className={`px-6 py-4 rounded-lg text-lg border-2 border-blue-800 ${
                !stageStarted
                  ? "bg-orange-400 cursor-not-allowed"
                  : "bg-gray-500 hover:bg-gray-600"
              } text-white shadow-md`}
            >
              Photo
            </button>
  
            {/* Undo Button */}
            {showUndo && (
              <button
                onClick={handleUndoLastWaypoint}
                type="button"
                className="px-6 py-4 rounded-lg text-lg bg-red-500 hover:bg-red-600 text-white border-2 border-blue-800 cursor-pointer flex items-center gap-3 shadow-md"
              >
                Undo ({undoTimeLeft}s)
              </button>
            )}
  
            {/* Tracking Status */}
            {isTracking && (
              <div className="flex items-center text-green-600 font-bold">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-ping mr-2" />
                Tracking...
              </div>
            )}
          </div>
        </div>
  
        {/* Two-Column Layout for Waypoints and Summaries */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* LEFT COLUMN: Current Stage Waypoints */}
          <div className="flex-1">
            <div className="bg-white shadow-sm rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Current Stage Waypoints</h2>
                {waypoints.length > 0 && (
                  <div className="flex items-center gap-2">
                    {bulkSelectMode && (
                      <>
                        <span className="text-sm text-gray-600">
                          {selectedWaypoints.size} selected
                        </span>
                        <button
                          onClick={selectAllWaypoints}
                          className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        >
                          {selectedWaypoints.size === waypoints.length
                            ? "Deselect All"
                            : "Select All"}
                        </button>
                        {selectedWaypoints.size > 0 && (
                          <button
                            onClick={deleteSelectedWaypoints}
                            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                          >
                            Delete ({selectedWaypoints.size})
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={toggleBulkSelectMode}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkSelectMode
                          ? "bg-gray-500 text-white hover:bg-gray-600"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      {bulkSelectMode ? "Exit Select" : "Select Multiple"}
                    </button>
                  </div>
                )}
              </div>
  
              <div
                ref={waypointListRef}
                className="max-h-96 overflow-y-auto pr-1"
              >
                {waypoints.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No waypoints added yet. Start a stage and add waypoints using the buttons above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {waypoints.map((wp, idx) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded border">
                        {/* Bulk selection checkbox */}
                        {bulkSelectMode && (
                          <div className="flex items-center mb-2">
                            <input
                              type="checkbox"
                              checked={selectedWaypoints.has(idx)}
                              onChange={() => toggleWaypointSelection(idx)}
                              className="w-4 h-4 mr-2"
                            />
                            <span className="text-sm text-gray-600">
                              Select for bulk operations
                            </span>
                          </div>
                        )}
  
                        <div className="flex items-center gap-2 mb-2">
                          {/* Waypoint indicator */}
                          <div className="w-6 h-6 flex items-center justify-center">
                            {wp.voiceCreated ? (
                              <span className="text-blue-500">🎤</span>
                            ) : wp.iconSrc ? (
                              <img src={wp.iconSrc} className="w-6 h-6" alt={wp.name} />
                            ) : (
                              <span className="text-gray-400">📍</span>
                            )}
                          </div>
  
                          {/* Waypoint name (editable) */}
                          {editingWaypoint === idx ? (
                            <div className="flex-1 flex gap-2">
                              <input
                                value={editValues.name}
                                onChange={(e) =>
                                  setEditValues((prev) => ({
                                    ...prev,
                                    name: e.target.value,
                                  }))
                                }
                                onKeyDown={handleEditKeyPress}
                                className="flex-1 px-2 py-1 border rounded text-sm"
                                placeholder="Waypoint name"
                                autoFocus
                              />
                              <button
                                onClick={saveWaypointEdit}
                                className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                              >
                                ✓
                              </button>
                              <button
                                onClick={cancelWaypointEdit}
                                className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                              >
                                ✗
                              </button>
                            </div>
                          ) : (
                            <p
                              className="font-semibold cursor-pointer hover:bg-yellow-100 px-1 rounded flex-1"
                              onClick={() => startEditingWaypoint(idx)}
                              title="Click to edit"
                            >
                              {wp.name}
                            </p>
                          )}
                        </div>
  
                        {/* Waypoint details */}
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Time: {wp.timestamp}</p>
                          <p>GPS: {wp.lat.toFixed(6)}, {wp.lon.toFixed(6)}</p>
                          <p>Distance: {wp.distance} km</p>
                          {wp.category && (
                            <p>Category: {wp.category}</p>
                          )}
                        </div>
  
                        {/* POI notes (editable) */}
                        {editingWaypoint === idx ? (
                          <div className="mt-2">
                            <textarea
                              value={editValues.poi}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  poi: e.target.value,
                                }))
                              }
                              onKeyDown={handleEditKeyPress}
                              className="w-full px-2 py-1 border rounded text-sm"
                              placeholder="POI notes (optional)"
                              rows="2"
                            />
                          </div>
                        ) : (
                          wp.poi && (
                            <p
                              className="text-sm text-gray-600 cursor-pointer hover:bg-yellow-100 px-1 rounded mt-2"
                              onClick={() => startEditingWaypoint(idx)}
                              title="Click to edit"
                            >
                              POI: {wp.poi}
                            </p>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
  
          {/* RIGHT COLUMN: Stage Summaries */}
          <div className="flex-1">
            <div className="bg-white shadow-sm rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Stage Summaries</h2>
                {stageSummaries.length > 0 && (
                  <span className="text-sm text-gray-600 bg-gray-200 px-2 py-1 rounded">
                    {stageSummaries.length} completed
                  </span>
                )}
              </div>
  
              <div className="max-h-96 overflow-y-auto pr-1">
                {stageSummaries.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No stages completed yet. Complete a stage to see summaries here.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stageSummaries.map((summary, idx) => (
                      <div key={idx} className="bg-gray-50 border rounded p-3">
                        <h3 className="font-bold text-blue-700 mb-2">
                          {summary.name}
                        </h3>
                        {summary.routeName && (
                          <p className="text-sm text-gray-600 mb-1">
                            Route: {summary.routeName}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <p>Waypoints: {summary.waypointCount}</p>
                          <p>Distance: {summary.totalDistance} km</p>
                          <p>Start: {summary.startTime}</p>
                          <p>End: {summary.endTime}</p>
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          <p>Start GPS: {summary.startCoords}</p>
                          <p>End GPS: {summary.endCoords}</p>
                        </div>
                        {summary.pois.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">POIs:</p>
                            <p className="text-sm text-gray-600">{summary.pois.join(", ")}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
  
        {/* Replay Section */}
        {showReplay && (
          <div className="bg-white shadow-sm rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Route Replay</h2>
              <button
                onClick={() => setShowReplay(false)}
                className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
              >
                Close Replay
              </button>
            </div>
            <ReplayRoute waypoints={waypoints} />
          </div>
        )}
  
        {/* Additional Controls */}
        <div className="bg-white shadow-sm rounded-lg p-4">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setShowReplay(!showReplay)}
              disabled={waypoints.length === 0}
              className={`px-4 py-2 rounded font-medium ${
                waypoints.length === 0
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              {showReplay ? "Hide" : "Show"} Replay
            </button>
  
            <button
              onClick={() => setShowMap(!showMap)}
              className={`px-4 py-2 rounded font-medium ${
                showMap
                  ? "bg-gray-500 hover:bg-gray-600"
                  : "bg-blue-500 hover:bg-blue-600"
              } text-white`}
            >
              {showMap ? "Hide" : "Show"} Map
            </button>
  
            {/* Manual export buttons */}
            <button
              onClick={() => exportAsGPX(waypoints, trackingPoints, routeName || "manual-export")}
              disabled={waypoints.length === 0}
              className={`px-4 py-2 rounded font-medium ${
                waypoints.length === 0
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-indigo-500 hover:bg-indigo-600 text-white"
              }`}
            >
              Export GPX
            </button>
  
            <button
              onClick={() => exportAsJSON(waypoints, trackingPoints, routeName || "manual-export")}
              disabled={waypoints.length === 0}
              className={`px-4 py-2 rounded font-medium ${
                waypoints.length === 0
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-purple-500 hover:bg-purple-600 text-white"
              }`}
            >
              Export JSON
            </button>
          </div>
        </div>
  
        {/* Confirmation Dialogs */}
        <StartstageConfirmDialog />
        <EndstageConfirmDialog />
      </div>
    );

  // Success notification for waypoint addition
  const WaypointSuccessNotification = () => {
    if (!waypointAdded) return null;



  // Replace your existing handleEndstage function with this corrected version:


  // (Removed malformed try/catch and orphaned code block that was outside any function)

  // Show auth if not logged in
  if (!user) {
    return (
      <div className="app">
        <Auth />
        <button
          onClick={() => setUser("guest")}
          className="mt-4 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Continue without account (no cloud backup)
        </button>
      </div>
    );
  }

  return (
      <div className="app min-h-screen bg-gray-50">
        {/* Status notifications */}
        <GPSStatus />
        <WaypointSuccessNotification />
        
        {/* Header with route controls */}
        <div className="bg-white shadow-sm p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Day and Route Info */}
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-800">
                Rally Mapper Voice - Day {currentDay}, Route {currentRoute}
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={handleNewDay}
                  className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600"
                >
                  New Day
                </button>
                <button
                  onClick={handleNewRoute}
                  className="px-3 py-1 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
                >
                  New Route
                </button>
              </div>
            </div>
  
            {/* Sync Status */}
            {user !== "guest" && (
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    syncStatus === "synced"
                      ? "bg-green-500"
                      : syncStatus === "syncing"
                      ? "bg-yellow-500 animate-pulse"
                      : syncStatus === "error"
                      ? "bg-red-500"
                      : "bg-gray-400"
                  }`}
                />
                <span className="text-sm text-gray-600 capitalize">
                  {syncStatus === "synced" ? "Cloud Synced" : syncStatus}
                </span>
              </div>
            )}
          </div>
  
          {/* Route Name Input */}
          <div className="mt-4">
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Enter route name..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
  
          {/* Stage Controls */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={stageStarted ? () => setShowStartstageConfirm(true) : handleStartstage}
              disabled={stageLoading}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                stageLoading
                  ? "bg-gray-400 cursor-not-allowed"
                  : stageStarted
                  ? "bg-orange-500 hover:bg-orange-600"
                  : "bg-green-500 hover:bg-green-600"
              } text-white`}
            >
              {stageLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Starting...
                </div>
              ) : stageStarted ? (
                `End ${stageName}`
              ) : (
                `Start ${stageName}`
              )}
            </button>
  
            {stageStarted && (
              <button
                onClick={() => setShowEndstageConfirm(true)}
                className="px-4 py-2 bg-red-500 text-white rounded font-medium hover:bg-red-600"
              >
                End Stage & Export
              </button>
            )}
  
            <button
              onClick={() => setShowVoiceInstructions(!showVoiceInstructions)}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                showVoiceInstructions
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Voice Help
            </button>
          </div>
  
          {/* Voice Instructions - Collapsible */}
          {showVoiceInstructions && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">Voice Commands</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-blue-700">Stage Control:</h4>
                  <ul className="text-blue-600 mt-1 space-y-1">
                    <li>• "Stage start" - Begin new stage</li>
                    <li>• "Stage end" - End current stage</li>
                    <li>• "Undo" - Remove last waypoint</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-blue-700">Navigation Examples:</h4>
                  <ul className="text-blue-600 mt-1 space-y-1">
                    <li>• "Left turn in 2k"</li>
                    <li>• "Cattle grid ahead"</li>
                    <li>• "Rough surface for 1k"</li>
                    <li>• "Bridge over creek"</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
  
        {/* Map Section */}
        {showMap && (
          <div className="mb-4">
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b">
                <h2 className="text-lg font-semibold">Live Map View</h2>
                <div className="flex gap-2">
                  <button
                    onClick={recenterOnGPS}
                    disabled={!currentGPS}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      isFollowingGPS
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    GPS Follow: {isFollowingGPS ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => setFullScreenMap(!fullScreenMap)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    {fullScreenMap ? "Exit Fullscreen" : "Fullscreen"}
                  </button>
                </div>
              </div>
              
              <div
                className="relative"
                style={{
                  height: fullScreenMap ? "80vh" : "50vh",
                  minHeight: "300px",
                }}
              >
                <GoogleMap
                  key={refreshKey}
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  center={mapCenter}
                  zoom={mapZoom}
                  mapTypeId={mapType}
                  onDragStart={handleMapDragStart}
                  onDragEnd={handleMapDragEnd}
                  onZoomChanged={(map) => handleMapZoomChanged(map)}
                  options={{
                    zoomControl: true,
                    mapTypeControl: false,
                    scaleControl: true,
                    streetViewControl: false,
                    rotateControl: true,
                    fullscreenControl: false,
                    gestureHandling: "greedy",
                  }}
                >
                  {/* Current GPS Position */}
                  {currentGPS && (
                    <Marker
                      position={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                      icon={{
                        url: "data:image/svg+xml," + encodeURIComponent(`
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="8" fill="#3B82F6" stroke="white" stroke-width="2"/>
                            <circle cx="10" cy="10" r="3" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new window.google.maps.Size(20, 20),
                        anchor: new window.google.maps.Point(10, 10),
                      }}
                      title="Your current location"
                    />
                  )}
  
                  {/* GPS Accuracy Circle */}
                  {currentGPS && gpsAccuracy && (
                    <Circle
                      center={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                      radius={gpsAccuracy}
                      options={{
                        fillColor: "#3B82F6",
                        fillOpacity: 0.1,
                        strokeColor: "#3B82F6",
                        strokeOpacity: 0.3,
                        strokeWeight: 1,
                      }}
                    />
                  )}
  
                  {/* Waypoint Markers */}
                  {waypoints.map((wp, index) => (
                    <Marker
                      key={index}
                      position={{ lat: wp.lat, lng: wp.lon }}
                      title={`${index + 1}: ${wp.name}`}
                      icon={{
                        url: "data:image/svg+xml," + encodeURIComponent(`
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" fill="${wp.voiceCreated ? '#EF4444' : '#10B981'}" stroke="white" stroke-width="2"/>
                            <text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${index + 1}</text>
                          </svg>
                        `),
                        scaledSize: new window.google.maps.Size(24, 24),
                        anchor: new window.google.maps.Point(12, 12),
                      }}
                      onClick={() => setSelectedWaypoint(selectedWaypoint === index ? null : index)}
                    />
                  ))}
  
                  {/* Info Window for Selected Waypoint */}
                  {selectedWaypoint !== null && waypoints[selectedWaypoint] && (
                    <InfoWindow
                      position={{
                        lat: waypoints[selectedWaypoint].lat,
                        lng: waypoints[selectedWaypoint].lon,
                      }}
                      onCloseClick={() => setSelectedWaypoint(null)}
                    >
                      <div className="p-2">
                        <h3 className="font-bold">{waypoints[selectedWaypoint].name}</h3>
                        <p className="text-sm">Distance: {waypoints[selectedWaypoint].distance} km</p>
                        <p className="text-sm">Time: {waypoints[selectedWaypoint].timestamp}</p>
                        {waypoints[selectedWaypoint].poi && (
                          <p className="text-sm mt-1">POI: {waypoints[selectedWaypoint].poi}</p>
                        )}
                      </div>
                    </InfoWindow>
                  )}
  
                  {/* Route Path */}
                  {routePath.length > 1 && (
                    <Polyline
                      path={routePath}
                      options={{
                        strokeColor: "#DC2626",
                        strokeOpacity: 0.8,
                        strokeWeight: 3,
                      }}
                    />
                  )}
  
                  {/* Tracking Path */}
                  {trackingPoints.length > 1 && (
                    <Polyline
                      path={trackingPoints.map((pt) => ({ lat: pt.lat, lng: pt.lon }))}
                      options={{
                        strokeColor: "#059669",
                        strokeOpacity: 0.6,
                        strokeWeight: 2,
                        strokeDasharray: "10,5",
                      }}
                    />
                  )}
  
                  {/* Map Controls */}
                  <MapControls />
                  
                  {/* Route Stats Overlay */}
                  <RouteStatsOverlay />
                </GoogleMap>
              </div>
            </div>
          </div>
        )}
  
        {/* Main Controls Section */}
        <div className="bg-white shadow-sm rounded-lg p-4 mb-4">
          {/* Waypoint Entry Controls */}
          <div className="flex justify-center items-center gap-4 my-4 flex-wrap">
            {/* Distance Display */}
            <div className="w-32 h-16 flex flex-col items-center justify-center bg-white border-2 border-blue-800 rounded-lg font-bold shadow-md p-4">
              <span className="text-2xl text-center leading-tight">
                {totalDistance.toFixed(2)} km
              </span>
            </div>
  
            {/* Add Waypoint Button */}
            <button
              onClick={handleAddWaypoint}
              type="button"
              disabled={!currentGPS || !stageStarted}
              className={`px-6 py-4 rounded-lg text-lg font-medium transition-all flex items-center gap-2 border-2 border-blue-800 ${
                !currentGPS || !stageStarted
                  ? "bg-orange-400 cursor-not-allowed"
                  : waypointAdded
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-green-500 hover:bg-green-600"
              } text-white shadow-md`}
            >
              {waypointAdded ? "Added!" : "Add Waypoint"}
            </button>
  
            {/* Voice Input Button */}
            <button
              onClick={stageStarted ? startVoiceInput : handleGlobalVoiceCommands}
              type="button"
              disabled={!stageStarted}
              className={`px-6 py-4 rounded-lg text-lg font-medium transition-all flex items-center gap-3 border-2 border-blue-800 shadow-md ${
                !stageStarted
                  ? "bg-orange-400 cursor-not-allowed"
                  : recognitionActive
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
              } text-white`}
            >
              {recognitionActive ? (
                <>
                  <div className="w-4 h-4 bg-white rounded-full animate-pulse" />
                  Listening...
                </>
              ) : (
                "Add Location"
              )}
            </button>
  
            {/* Photo Button */}
            <button
              onClick={() => alert("Photo feature not yet implemented")}
              type="button"
              disabled={!stageStarted}
              className={`px-6 py-4 rounded-lg text-lg border-2 border-blue-800 ${
                !stageStarted
                  ? "bg-orange-400 cursor-not-allowed"
                  : "bg-gray-500 hover:bg-gray-600"
              } text-white shadow-md`}
            >
              Photo
            </button>
  
            {/* Undo Button */}
            {showUndo && (
              <button
                onClick={handleUndoLastWaypoint}
                type="button"
                className="px-6 py-4 rounded-lg text-lg bg-red-500 hover:bg-red-600 text-white border-2 border-blue-800 cursor-pointer flex items-center gap-3 shadow-md"
              >
                Undo ({undoTimeLeft}s)
              </button>
            )}
  
            {/* Tracking Status */}
            {isTracking && (
              <div className="flex items-center text-green-600 font-bold">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-ping mr-2" />
                Tracking...
              </div>
            )}
          </div>
        </div>
  
        {/* Two-Column Layout for Waypoints and Summaries */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* LEFT COLUMN: Current Stage Waypoints */}
          <div className="flex-1">
            <div className="bg-white shadow-sm rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Current Stage Waypoints</h2>
                {waypoints.length > 0 && (
                  <div className="flex items-center gap-2">
                    {bulkSelectMode && (
                      <>
                        <span className="text-sm text-gray-600">
                          {selectedWaypoints.size} selected
                        </span>
                        <button
                          onClick={selectAllWaypoints}
                          className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        >
                          {selectedWaypoints.size === waypoints.length
                            ? "Deselect All"
                            : "Select All"}
                        </button>
                        {selectedWaypoints.size > 0 && (
                          <button
                            onClick={deleteSelectedWaypoints}
                            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                          >
                            Delete ({selectedWaypoints.size})
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={toggleBulkSelectMode}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkSelectMode
                          ? "bg-gray-500 text-white hover:bg-gray-600"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      {bulkSelectMode ? "Exit Select" : "Select Multiple"}
                    </button>
                  </div>
                )}
              </div>
  
              <div
                ref={waypointListRef}
                className="max-h-96 overflow-y-auto pr-1"
              >
                {waypoints.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No waypoints added yet. Start a stage and add waypoints using the buttons above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {waypoints.map((wp, idx) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded border">
                        {/* Bulk selection checkbox */}
                        {bulkSelectMode && (
                          <div className="flex items-center mb-2">
                            <input
                              type="checkbox"
                              checked={selectedWaypoints.has(idx)}
                              onChange={() => toggleWaypointSelection(idx)}
                              className="w-4 h-4 mr-2"
                            />
                            <span className="text-sm text-gray-600">
                              Select for bulk operations
                            </span>
                          </div>
                        )}
  
                        <div className="flex items-center gap-2 mb-2">
                          {/* Waypoint indicator */}
                          <div className="w-6 h-6 flex items-center justify-center">
                            {wp.voiceCreated ? (
                              <span className="text-blue-500">🎤</span>
                            ) : wp.iconSrc ? (
                              <img src={wp.iconSrc} className="w-6 h-6" alt={wp.name} />
                            ) : (
                              <span className="text-gray-400">📍</span>
                            )}
                          </div>
  
                          {/* Waypoint name (editable) */}
                          {editingWaypoint === idx ? (
                            <div className="flex-1 flex gap-2">
                              <input
                                value={editValues.name}
                                onChange={(e) =>
                                  setEditValues((prev) => ({
                                    ...prev,
                                    name: e.target.value,
                                  }))
                                }
                                onKeyDown={handleEditKeyPress}
                                className="flex-1 px-2 py-1 border rounded text-sm"
                                placeholder="Waypoint name"
                                autoFocus
                              />
                              <button
                                onClick={saveWaypointEdit}
                                className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                              >
                                ✓
                              </button>
                              <button
                                onClick={cancelWaypointEdit}
                                className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                              >
                                ✗
                              </button>
                            </div>
                          ) : (
                            <p
                              className="font-semibold cursor-pointer hover:bg-yellow-100 px-1 rounded flex-1"
                              onClick={() => startEditingWaypoint(idx)}
                              title="Click to edit"
                            >
                              {wp.name}
                            </p>
                          )}
                        </div>
  
                        {/* Waypoint details */}
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Time: {wp.timestamp}</p>
                          <p>GPS: {wp.lat.toFixed(6)}, {wp.lon.toFixed(6)}</p>
                          <p>Distance: {wp.distance} km</p>
                          {wp.category && (
                            <p>Category: {wp.category}</p>
                          )}
                        </div>
  
                        {/* POI notes (editable) */}
                        {editingWaypoint === idx ? (
                          <div className="mt-2">
                            <textarea
                              value={editValues.poi}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  poi: e.target.value,
                                }))
                              }
                              onKeyDown={handleEditKeyPress}
                              className="w-full px-2 py-1 border rounded text-sm"
                              placeholder="POI notes (optional)"
                              rows="2"
                            />
                          </div>
                        ) : (
                          wp.poi && (
                            <p
                              className="text-sm text-gray-600 cursor-pointer hover:bg-yellow-100 px-1 rounded mt-2"
                              onClick={() => startEditingWaypoint(idx)}
                              title="Click to edit"
                            >
                              POI: {wp.poi}
                            </p>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
  
          {/* RIGHT COLUMN: Stage Summaries */}
          <div className="flex-1">
            <div className="bg-white shadow-sm rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Stage Summaries</h2>
                {stageSummaries.length > 0 && (
                  <span className="text-sm text-gray-600 bg-gray-200 px-2 py-1 rounded">
                    {stageSummaries.length} completed
                  </span>
                )}
              </div>
  
              <div className="max-h-96 overflow-y-auto pr-1">
                {stageSummaries.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No stages completed yet. Complete a stage to see summaries here.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stageSummaries.map((summary, idx) => (
                      <div key={idx} className="bg-gray-50 border rounded p-3">
                        <h3 className="font-bold text-blue-700 mb-2">
                          {summary.name}
                        </h3>
                        {summary.routeName && (
                          <p className="text-sm text-gray-600 mb-1">
                            Route: {summary.routeName}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <p>Waypoints: {summary.waypointCount}</p>
                          <p>Distance: {summary.totalDistance} km</p>
                          <p>Start: {summary.startTime}</p>
                          <p>End: {summary.endTime}</p>
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          <p>Start GPS: {summary.startCoords}</p>
                          <p>End GPS: {summary.endCoords}</p>
                        </div>
                        {summary.pois.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">POIs:</p>
                            <p className="text-sm text-gray-600">{summary.pois.join(", ")}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
  
        {/* Replay Section */}
        {showReplay && (
          <div className="bg-white shadow-sm rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Route Replay</h2>
              <button
                onClick={() => setShowReplay(false)}
                className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
              >
                Close Replay
              </button>
            </div>
            <ReplayRoute waypoints={waypoints} />
          </div>
        )}
  
        {/* Additional Controls */}
        <div className="bg-white shadow-sm rounded-lg p-4">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setShowReplay(!showReplay)}
              disabled={waypoints.length === 0}
              className={`px-4 py-2 rounded font-medium ${
                waypoints.length === 0
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              {showReplay ? "Hide" : "Show"} Replay
            </button>
  
            <button
              onClick={() => setShowMap(!showMap)}
              className={`px-4 py-2 rounded font-medium ${
                showMap
                  ? "bg-gray-500 hover:bg-gray-600"
                  : "bg-blue-500 hover:bg-blue-600"
              } text-white`}
            >
              {showMap ? "Hide" : "Show"} Map
            </button>
  
            {/* Manual export buttons */}
            <button
              onClick={() => exportAsGPX(waypoints, trackingPoints, routeName || "manual-export")}
              disabled={waypoints.length === 0}
              className={`px-4 py-2 rounded font-medium ${
                waypoints.length === 0
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-indigo-500 hover:bg-indigo-600 text-white"
              }`}
            >
              Export GPX
            </button>
  
            <button
              onClick={() => exportAsJSON(waypoints, trackingPoints, routeName || "manual-export")}
              disabled={waypoints.length === 0}
              className={`px-4 py-2 rounded font-medium ${
                waypoints.length === 0
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-purple-500 hover:bg-purple-600 text-white"
              }`}
            >
              Export JSON
            </button>
          </div>
        </div>
  
        {/* Confirmation Dialogs */}
        <StartstageConfirmDialog />
        <EndstageConfirmDialog />
      </div>
    );

  // Map Controls Component
  const MapControls = () => (
    <>
      {/* Map Type Selector - Top Left */}
      <div
        style={{ position: "absolute", top: "8px", left: "8px", zIndex: 10 }}
      >
        <div className="bg-white rounded-lg shadow-lg p-2">
          <div className="grid grid-cols-4 gap-1">
            {mapTypes.map((type) => (
              <button
                key={type.key}
                onClick={() => setMapType(type.key)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  mapType === type.key
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                <span className="mr-1">{type.icon}</span>
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Route Stats Toggle - Top Right */}
      <div
        style={{ position: "absolute", top: "8px", right: "8px", zIndex: 10 }}
      >
        <button
          onClick={() => setShowRouteStats(!showRouteStats)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showRouteStats
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-700 hover:bg-gray-100"
          } shadow-lg`}
        >
          📊 Stats
        </button>
      </div>
    </>
  );

  const RouteStatsOverlay = () => {
    if (!showRouteStats || waypoints.length === 0) {
      return null;
    }

    return (
      <div className="absolute bottom-4 left-4 bg-white bg-opacity-95 rounded-lg shadow-lg p-4 z-50 min-w-48">
        <h3 className="font-bold text-gray-800 mb-2">Route Statistics</h3>
        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Waypoints:</span>
            <span className="font-medium">{routeStats.totalWaypoints}</span>
          </div>
          <div className="flex justify-between">
            <span>Distance:</span>
            <span className="font-medium">{routeStats.routeDistance} km</span>
          </div>
          {isTracking && (
            <>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-medium">{routeStats.duration} min</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Speed:</span>
                <span className="font-medium">{routeStats.avgSpeed} km/h</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // (Main JSX return is below; removed premature return block)

  return (
    <div className="p-4">
      {/* (Removed duplicated JSX block prior to main return) */}

      {/* Voice Instructions - Collapsible */}
      {/* Waypoint Entry */}
      <div>
        {/* Centered button + meter container */}
        <div className="flex justify-center items-center gap-4 my-4 flex-wrap">
          {/* KM Display */}
          <div
            style={{
              width: "128px",
              height: "28px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "white",
              border: "2px solid #1e3a8a",
              borderRadius: "8px",
              fontWeight: "bold",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              padding: "16px",
            }}
          >
            <span
              style={{
                fontSize: "1.5rem",
                textAlign: "center",
                lineHeight: "1.2",
                padding: "8px",
              }}
            >
              {totalDistance.toFixed(2)} km
            </span>
          </div>{" "}
          {/* Add Waypoint Button */}
          <button
            onClick={handleAddWaypoint}
            type="button"
            disabled={!currentGPS || !stageStarted}
            style={{
              padding: "18px 16px",
              borderRadius: "8px",
              // fontWeight: "600",
              fontSize: "1.0rem",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor:
                !currentGPS || !stageStarted
                  ? "#e98547"
                  : waypointAdded
                  ? "#059669"
                  : "#16a34a",
              color: "white",
              cursor: !currentGPS || !stageStarted ? "not-allowed" : "pointer",
              border: "2px solid #1e3a8a",
            }}
          >
            {waypointAdded ? <>✅ Added!</> : <>📍 Add Waypoint</>}
          </button>
          {/* Undo Button - When Available */}
          {showUndo && (
            <button
              onClick={handleUndoLastWaypoint}
              type="button"
              style={{
                padding: "18px 16px",
                borderRadius: "8px",
                // fontWeight: "600",
                fontSize: "1rem",
                backgroundColor: "#EF4444",
                color: "white",
                border: "2px solid #1e3a8a",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            >
              ↩️ Undo ({undoTimeLeft}s)
            </button>
          )}
          <button
            onClick={stageStarted ? startVoiceInput : handleGlobalVoiceCommands}
            type="button"
            disabled={!stageStarted}
            style={{
              padding: "18px 16px",
              borderRadius: "8px",
              //fontWeight: "600",
              fontSize: "1.00rem",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              backgroundColor: !stageStarted
                ? "#e98547"
                : recognitionActive
                ? "#EF4444"
                : "#16a34a",
              color: "white",
              cursor: !stageStarted ? "not-allowed" : "pointer",
              border: "2px solid #1e3a8a",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          >
            {recognitionActive ? (
              <>
                <div className="w-4 h-4 bg-white rounded-full animate-pulse"></div>
                Listening...
              </>
            ) : stageStarted ? (
              <>🎤 Add Location</>
            ) : (
              <>🎤 Add Location</>
            )}
          </button>
          <button
            style={{
              padding: "18px 16px",
              borderRadius: "8px",
              fontSize: "1.0rem",
              backgroundColor: !stageStarted ? "#e98547" : "#D1D5DB",
              color: "white",
              border: "2px solid #1e3a8a",
              cursor: !stageStarted ? "not-allowed" : "pointer",
            }}
            onClick={() => alert("Photo feature not yet implemented")}
            type="button"
            disabled={!stageStarted}
          >
            📷 Photo
          </button>
          {/* Tracking Status */}
          {isTracking && (
            <div className="flex items-center text-green-600 font-bold">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-ping mr-2"></div>
              📍 Tracking...
            </div>
          )}
        </div>
        {/* Waypoints List */}

        {/* Two-Column Layout using Inline Styles */}
        <div
          style={{
            display: "flex",
            flexDirection: window.innerWidth >= 768 ? "row" : "column",
            gap: "24px",
            marginTop: "24px",
          }}
        >
          {/* LEFT COLUMN: Current Stage Waypoints */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
                minHeight: "32px",
              }}
            >
              <h2 className="text-lg font-semibold">
                🧭 Current Stage Waypoints
              </h2>

              {waypoints.length > 0 && (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  {bulkSelectMode && (
                    <>
                      <span className="text-sm text-gray-600">
                        {selectedWaypoints.size} selected
                      </span>
                      <button
                        onClick={selectAllWaypoints}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        {selectedWaypoints.size === waypoints.length
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                      {selectedWaypoints.size > 0 && (
                        <button
                          onClick={deleteSelectedWaypoints}
                          className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        >
                          Delete ({selectedWaypoints.size})
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={toggleBulkSelectMode}
                    className={`px-3 py-1 rounded text-sm ${
                      bulkSelectMode
                        ? "bg-gray-500 text-white hover:bg-gray-600"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    {bulkSelectMode ? "Exit Select" : "Select Multiple"}
                  </button>
                </div>
              )}
            </div>

            <div
              ref={waypointListRef}
              style={{
                maxHeight: "40vh",
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {waypoints.length === 0 ? (
                <p className="text-gray-500">No waypoints added yet.</p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {waypoints.map((wp, idx) => (
                    <div key={idx} className="bg-gray-100 p-3 rounded">
                      {/* Add checkbox for bulk selection */}
                      {bulkSelectMode && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: "8px",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedWaypoints.has(idx)}
                            onChange={() => toggleWaypointSelection(idx)}
                            style={{ marginRight: "8px" }}
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-gray-600">
                            Select for bulk operations
                          </span>
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "8px",
                        }}
                      >
                        {/* Only show icon if waypoint has an iconSrc */}
                        {wp.iconSrc && (
                          <img
                            src={wp.iconSrc}
                            className="w-6 h-6"
                            alt={wp.name}
                            style={{ marginRight: "8px" }}
                          />
                        )}
                        {/* Show voice indicator for voice-created waypoints, icon for manual ones */}
                        {wp.voiceCreated ? (
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginRight: "8px",
                            }}
                          >
                            <span className="text-blue-500">🎤</span>
                          </div>
                        ) : wp.iconSrc ? (
                          <img
                            src={wp.iconSrc}
                            className="w-6 h-6"
                            alt={wp.name}
                            style={{ marginRight: "8px" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginRight: "8px",
                            }}
                          >
                            <span className="text-gray-400">📍</span>
                          </div>
                        )}
                        {editingWaypoint === idx ? (
                          <div style={{ flex: 1, display: "flex", gap: "8px" }}>
                            <input
                              value={editValues.name}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                              onKeyDown={handleEditKeyPress}
                              className="flex-1 px-2 py-1 border rounded text-sm"
                              placeholder="Waypoint name"
                              autoFocus
                            />
                            <button
                              onClick={saveWaypointEdit}
                              className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                            >
                              ✓
                            </button>
                            <button
                              onClick={cancelWaypointEdit}
                              className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                            >
                              ✗
                            </button>
                          </div>
                        ) : (
                          <p
                            className="font-semibold cursor-pointer hover:bg-yellow-100 px-1 rounded"
                            onClick={() => startEditingWaypoint(idx)}
                            title="Click to edit"
                            style={{ flex: 1 }}
                          >
                            {wp.name}
                          </p>
                        )}
                      </div>

                      <p className="text-sm text-gray-600">
                        Time: {wp.timestamp}
                      </p>
                      <p className="text-sm text-gray-600">
                        GPS: {wp.lat.toFixed(6)}, {wp.lon.toFixed(6)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Distance: {wp.distance} km
                      </p>

                      {editingWaypoint === idx ? (
                        <div style={{ marginTop: "8px" }}>
                          <textarea
                            value={editValues.poi}
                            onChange={(e) =>
                              setEditValues((prev) => ({
                                ...prev,
                                poi: e.target.value,
                              }))
                            }
                            onKeyDown={handleEditKeyPress}
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="POI notes (optional)"
                            rows="2"
                          />
                        </div>
                      ) : (
                        wp.poi && (
                          <p
                            className="text-sm text-gray-600 cursor-pointer hover:bg-yellow-100 px-1 rounded"
                            onClick={() => startEditingWaypoint(idx)}
                            title="Click to edit"
                            style={{ marginTop: "4px" }}
                          >
                            POI: {wp.poi}
                          </p>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Stage Summaries */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
                minHeight: "32px", // ← SAME HEIGHT as left column
              }}
            >
              <h2 className="text-lg font-semibold">📋 Stage Summaries</h2>
              {stageSummaries.length > 0 && (
                <span className="text-sm text-gray-600 bg-gray-200 px-2 py-1 rounded">
                  {stageSummaries.length} completed
                </span>
              )}
            </div>
            <div
              style={{
                maxHeight: "40vh",
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {stageSummaries.length === 0 ? (
                <p className="text-gray-500">No stages completed yet.</p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {stageSummaries.map((summary, idx) => (
                    <div key={idx} className="bg-white shadow rounded p-3">
                      <h3 className="font-bold text-blue-700">
                        {summary.name}
                      </h3>
                      {summary.routeName && (
                        <p className="text-sm text-gray-600">
                          Route: {summary.routeName}
                        </p>
                      )}
                      <p>Waypoints: {summary.waypointCount}</p>
                      <p>Start GPS: {summary.startCoords}</p>
                      <p>End GPS: {summary.endCoords}</p>
                      <p>Start: {summary.startTime}</p>
                      <p>End: {summary.endTime}</p>
                      <p>Total Distance: {summary.totalDistance} km</p>
                      {summary.pois.length > 0 && (
                        <p>POIs: {summary.pois.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
