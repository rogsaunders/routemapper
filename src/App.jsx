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
    console.log(`🔍 === STARTING EXPORT: ${filename} ===`);
    console.log(`📄 Content length: ${content.length} characters`);
    console.log(`📄 MIME type: ${mimeType}`);
    console.log(`📄 File size: ${new Blob([content]).size} bytes`);

    // Debug environment first
    const env = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      isIPad: /iPad|iPhone|iPod/.test(navigator.userAgent),
      isPWA: window.navigator.standalone,
      isIOSSafari:
        /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
      canShare: !!navigator.canShare,
      canShareFiles: navigator.canShare
        ? navigator.canShare({ files: [new File([""], "test.txt")] })
        : false,
      downloadSupport: "download" in document.createElement("a"),
      blobSupport: !!window.Blob,
      urlSupport: !!window.URL,
    };

    console.log("🔍 Export Environment:", env);

    const blob = new Blob([content], { type: mimeType });
    console.log(`📄 Blob created: ${blob.size} bytes, type: ${blob.type}`);

    // METHOD 1: Try iOS Share Sheet (Most reliable on iPad)
    if (env.canShare && env.canShareFiles) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        console.log(`📤 Attempting share sheet: ${file.name}`);

        const sharePromise = navigator.share({
          files: [file],
          title: title,
          text: `Rally route export: ${filename}`,
        });

        await navigator.share({
          files: [file],
          title: title,
          text: `Rally route export: ${filename}`,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Share timeout")), 5000)
        );

        await Promise.race([sharePromise, timeoutPromise]);

        console.log("✅ Share sheet successful");
        return { success: true, method: "share_sheet" };
      } catch (shareErr) {
        console.log("⚠️ Share sheet failed:", shareErr.message);
        // Continue to fallback methods
      }
    }

    // METHOD 2: Direct download (works in some iPad browsers)
    if (env.downloadSupport && env.urlSupport) {
      try {
        console.log("📥 Attempting direct download");

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";

        // Add to DOM, click, remove - iPad sometimes needs this
        document.body.appendChild(a);

        // Give iPad time to process
        await new Promise((resolve) => setTimeout(resolve, 100));

        a.click();

        // Clean up after delay
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);

        console.log("✅ Direct download triggered");
        return { success: true, method: "direct_download" };
      } catch (downloadErr) {
        console.log("⚠️ Direct download failed:", downloadErr.message);
      }
    }

    // METHOD 3: Open in new window (iPad fallback)
    try {
      console.log("🔗 Attempting new window method");

      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank");

      if (newWindow) {
        // Clean up after window opens
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        console.log("✅ New window opened");
        return { success: true, method: "new_window" };
      } else {
        throw new Error("Popup blocked");
      }
    } catch (windowErr) {
      console.log("⚠️ New window failed:", windowErr.message);
    }

    // METHOD 4: Data URL (last resort)
    try {
      console.log("📋 Attempting data URL method");

      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = () => {
          const dataUrl = reader.result;
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = filename;
          a.click();
          console.log("✅ Data URL method triggered");
          resolve({ success: true, method: "data_url" });
        };
        reader.readAsDataURL(blob);
      });
    } catch (dataErr) {
      console.log("⚠️ Data URL failed:", dataErr.message);
    }

    throw new Error("All export methods failed");
  } catch (error) {
    console.error(`❌ Export failed for ${filename}:`, error);
    return { success: false, error: error.message };
  }
};

const libraries = []; // declared outside the component or at top level
export default function App() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyCYZchsHu_Sd4KMNP1b6Dq30XzWWOuFPO8",
    libraries,
  });
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

  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      if (currentGPS?.lat && currentGPS?.lon) {
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
  }, [isTracking]);

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

      // ✅ USE IPAD-COMPATIBLE HELPER (this was missing!)
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

      // ✅ USE IPAD-COMPATIBLE HELPER (this was missing!)
      const result = await exportFileIPadCompatible(
        gpxContent,
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

  // ADD THIS BUTTON TO YOUR DEBUG stage:
  <button
    className="bg-indigo-600 text-white px-3 py-2 rounded text-sm hover:bg-indigo-700"
    onClick={async () => {
      if (waypoints.length === 0) {
        alert("❌ No waypoints to export! Add some waypoints first.");
        return;
      }

      try {
        setGpsError("📤 Exporting Rally Navigator GPX...");

        const testName = routeName || `rally-route-${Date.now()}`;
        await exportAsRallyNavigatorGPX(waypoints, trackingPoints, testName);

        setGpsError("✅ Rally Navigator GPX exported!");
        setTimeout(() => setGpsError(null), 3000);
      } catch (error) {
        console.error("❌ Rally Navigator export failed:", error);
        setGpsError("❌ Rally Navigator export failed");
        setTimeout(() => setGpsError(null), 3000);
      }
    }}
  >
    🧭 Rally Navigator GPX
  </button>;

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
  }

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
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-green-500 mr-2">📍</span>
            <span>GPS Active</span>
          </div>
          <div className="text-sm">
            <span className="mr-3">
              {currentGPS.lat.toFixed(6)}, {currentGPS.lon.toFixed(6)}
            </span>
            .Accuracy: ±{gpsAccuracy ? Math.round(gpsAccuracy) : "?"}m.
            <span
              className={`ml-2 px-2 py-1 rounded text-xs ${
                gpsAccuracy <= 10
                  ? "bg-green-200 text-green-800"
                  : gpsAccuracy <= 50
                  ? "bg-yellow-200 text-yellow-800"
                  : "bg-red-200 text-red-800"
              }`}
            >
              {gpsAccuracy <= 10
                ? "Excellent"
                : gpsAccuracy <= 50
                ? "Good"
                : "Poor"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Success notification for waypoint addition
  const WaypointSuccessNotification = () => {
    if (!waypointAdded) return null;

    return (
      <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce">
        <div className="flex items-center">
          <span className="text-xl mr-2">✅</span>
          <span>Waypoint Added!</span>
        </div>
      </div>
    );
  };

  const handleEndstage = async () => {
    try {
      setstageStarted(false);
      setUndoTimeLeft(5);
      setIsFollowingGPS(true); // Resume following GPS after stage ends

      const stageNameFormatted = `${todayDate}/Stage ${stageCount}`;
      const currentstage = { name: stageNameFormatted, waypoints };

      const summary = {
        name: stageNameFormatted,
        waypointCount: waypoints.length,
        startTime: waypoints[0]?.timestamp || "N/A",
        endTime: waypoints[waypoints.length - 1]?.timestamp || "N/A",
        totalDistance: waypoints
          .reduce((sum, wp) => sum + parseFloat(wp.distance || 0), 0)
          .toFixed(2),
        pois: [...new Set(waypoints.map((wp) => wp.poi).filter(Boolean))],
        startCoords: waypoints[0]
          ? `${waypoints[0].lat.toFixed(5)}, ${waypoints[0].lon.toFixed(5)}`
          : "N/A",
        endCoords: waypoints[waypoints.length - 1]
          ? `${waypoints[waypoints.length - 1].lat.toFixed(5)}, ${waypoints[
              waypoints.length - 1
            ].lon.toFixed(5)}`
          : "N/A",
        routeName: routeName || "Unnamed Route",
      };

      setstage((prev) => [...prev, currentstage]);
      setstageSummaries((prev) => [...prev, summary]);

      // Show user what's happening
      setGpsError("📤 Exporting files (iPad compatible)...");

      const exportName = routeName || stageNameFormatted;

      console.log("🔍 === MAIN EXPORT PROCESS START ===");
      console.log("Export name:", exportName);
      console.log("Waypoints:", waypoints.length);
      console.log("Tracking points:", trackingPoints.length);

      // Use iPad-compatible export functions with individual error handling
      const exportPromises = [
        exportAsJSON(waypoints, trackingPoints, exportName).catch((err) => {
          console.error("JSON export failed:", err);
          return { success: false, error: err.message };
        }),
        exportAsSimpleJSON(waypoints, trackingPoints, exportName).catch(
          (err) => {
            console.error("Simple JSON export failed:", err);
            return { success: false, error: err.message };
          }
        ),
        exportAsGPX(waypoints, trackingPoints, exportName).catch((err) => {
          console.error("GPX export failed:", err);
          return { success: false, error: err.message };
        }),
        exportAsKML(waypoints, trackingPoints, exportName).catch((err) => {
          console.error("KML export failed:", err);
          return { success: false, error: err.message };
        }),
      ];

      // Wait for all exports to complete
      const exportResults = [];

      try {
        console.log("📤 Starting sequential exports...");

        // Export 1: Enhanced JSON
        const json1 = await exportAsJSON(waypoints, trackingPoints, exportName);
        exportResults.push(json1);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay

        // Export 2: Simple JSON
        const json2 = await exportAsSimpleJSON(
          waypoints,
          trackingPoints,
          exportName
        );
        exportResults.push(json2);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay

        // Export 3: GPX
        const gpx = await exportAsGPX(waypoints, trackingPoints, exportName);
        exportResults.push(gpx);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay

        // Export 4: KML
        const kml = await exportAsKML(waypoints, trackingPoints, exportName);
        exportResults.push(kml);

        console.log("📤 All sequential exports completed");
      } catch (error) {
        console.error("❌ Sequential export failed:", error);
      }

      console.log("🔍 Export results:", results);
      console.log("🔍 === MAIN EXPORT PROCESS END ===");

      // Provide detailed feedback
      if (successCount === exportResults.length) {
        setGpsError("✅ All 4 files exported successfully!");
      } else if (successCount > 0) {
        const formatNames = ["Enhanced JSON", "Simple JSON", "GPX", "KML"];
        const successful = results
          .map((success, i) => (success ? formatNames[i] : null))
          .filter(Boolean);
        const failed = results
          .map((success, i) => (!success ? formatNames[i] : null))
          .filter(Boolean);

        setGpsError(
          `⚠️ ${successCount}/${
            exportResults.length
          } files exported.\n✅ ${successful.join(", ")}\n❌ ${failed.join(
            ", "
          )}`
        );
      } else {
        setGpsError("❌ All exports failed. Check console for details.");
      }

      setTimeout(() => setGpsError(null), 10000); // Longer display time for detailed message

      setRefreshKey((prev) => prev + 1);
      setIsTracking(false);
      localStorage.removeItem("unsavedWaypoints");

      console.log("Stage ended and exports completed.");
    } catch (error) {
      console.error("❌ handleEndstage error:", error);
      setGpsError("❌ Stage end failed. Check console.");
      setTimeout(() => setGpsError(null), 5000);
    }
  };

  const StartstageConfirmDialog = () => {
    if (!showStartstageConfirm) return null;

    return (
      <div
        style={{
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          bottom: "0",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: "999",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "24px",
            width: "320px",
            maxWidth: "90vw",
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
            margin: "20px",
          }}
        >
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: "bold",
              color: "#1F2937",
              marginBottom: "16px",
            }}
          >
            Start New stage?
          </h3>
          <p
            style={{
              color: "#6B7280",
              marginBottom: "24px",
              lineHeight: "1.5",
            }}
          >
            This will clear your current {waypoints.length} waypoint
            {waypoints.length !== 1 ? "s" : ""} and start fresh. Make sure
            you've exported your current data first.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setShowStartstageConfirm(false)}
              style={{
                flex: "1",
                padding: "10px 16px",
                backgroundColor: "#D1D5DB",
                color: "#374151",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowStartstageConfirm(false);
                handleStartstage();
              }}
              style={{
                flex: "1",
                padding: "10px 16px",
                backgroundColor: "#DC2626",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Start New stage
            </button>
          </div>
        </div>
      </div>
    );
  };

  const EndstageConfirmDialog = () => {
    if (!showEndstageConfirm) return null;

    return (
      <div
        style={{
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          bottom: "0",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: "999",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "24px",
            width: "320px",
            maxWidth: "90vw",
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
            margin: "20px",
          }}
        >
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: "bold",
              color: "#1F2937",
              marginBottom: "16px",
            }}
          >
            End stage?
          </h3>
          <p
            style={{
              color: "#6B7280",
              marginBottom: "24px",
              lineHeight: "1.5",
            }}
          >
            This will export your route data and clear current waypoints. This
            action cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setShowEndstageConfirm(false)}
              style={{
                flex: "1",
                padding: "10px 16px",
                backgroundColor: "#D1D5DB",
                color: "#374151",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowEndstageConfirm(false);
                handleEndstage();
              }}
              style={{
                flex: "1",
                padding: "10px 16px",
                backgroundColor: "#DC2626",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              End stage
            </button>
          </div>
        </div>
      </div>
    );
  };

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

  return (
    <div className="p-4">
      {/* Success notification overlay */}
      <WaypointSuccessNotification />
      {/* End stage Confirmation Dialog */}
      <EndstageConfirmDialog />
      {/* Start stage Confirmation Dialog */}
      <StartstageConfirmDialog />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-blue-800 flex items-center gap-2">
          <img src="/RRM Logo 64x64.png" className="w-8 h-8" alt="RRM Logo" />
          Rally Route Mapper
        </h1>
      </div>
      {/* GPS Status Display */}
      <GPSStatus />
      <div className="flex gap-4 mb-4">
        <button
          className="px-4 py-2 bg-brown-600 text-white rounded hover:bg-brown-700 text-sm"
          onClick={() => setShowMap((prev) => !prev)}
        >
          {showMap ? "Hide Map" : "Show Map"}
        </button>
        <button
          className="px-4 py-2 bg-brown-600 text-white rounded hover:bg-brown-700 text-sm"
          onClick={() => setFullScreenMap((prev) => !prev)}
        >
          {fullScreenMap ? "Exit Full Screen" : "Full Screen Map"}
        </button>
        <button
          onClick={() => setShowReplay((prev) => !prev)}
          className="px-4 py-2 bg-brown-600 text-white rounded hover:bg-brown-700 text-sm"
        >
          {showReplay ? "Hide" : "Show"} Route Replay
        </button>

        {showReplay && <ReplayRoute waypoints={waypoints} />}
        <button
          onClick={recenterOnGPS}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg ${
            isFollowingGPS
              ? "bg-brown-600 text-white hover:bg-brown-700" // Blue when following
              : "bg-blue-600 text-white hover:bg-blue-700" // Orange when not following
          }`}
          title={isFollowingGPS ? "Following GPS" : "Click to re-center on GPS"}
        >
          📍 {isFollowingGPS ? "Following GPS" : "Re-center"}
        </button>
      </div>
      {showMap && (
        <div
          className={`relative w-full mb-2 ${
            fullScreenMap ? "h-screen" : "h-[200px]"
          }`}
        >
          {isLoaded && currentGPS && (
            <>
              {/* Map overlay controls */}
              <MapControls />
              <RouteStatsOverlay />

              <GoogleMap
                key={refreshKey} // Add key to force refresh when recentering
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={mapCenter} // Use dynamic center
                zoom={mapZoom}
                mapTypeId={mapType}
                onDragStart={handleMapDragStart}
                onDragEnd={handleMapDragEnd}
                onZoomChanged={(e) => {
                  const map = e || this;
                  handleMapZoomChanged(map);
                }}
                options={{
                  zoomControl: true,
                  mapTypeControl: false,
                  streetViewControl: false,
                  fullscreenControl: true,
                  gestureHandling: "greedy",
                  disableDefaultUI: false,
                  // Important: don't use disableDefaultUI: true as it can interfere
                }}
                onLoad={(map) => {
                  console.log("Map loaded");
                  // Store map reference if needed for programmatic control
                  window.rallyMap = map;
                }}
              >
                {/* Current location marker with enhanced styling */}
                <Marker
                  position={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: "#4285F4",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 3,
                  }}
                  title="Current Location"
                />

                {/* GPS accuracy circle */}
                {gpsAccuracy && (
                  <Circle
                    center={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                    radius={gpsAccuracy}
                    options={{
                      fillColor: isFollowingGPS ? "#4285F4" : "#FF6B35", // ← Match marker color
                      fillOpacity: 0.1,
                      strokeColor: isFollowingGPS ? "#4285F4" : "#FF6B35",
                      strokeOpacity: 0.3,
                      strokeWeight: 1,
                    }}
                  />
                )}

                {/* Waypoint markers with custom icons */}
                {waypoints.map((wp, index) => {
                  if (!wp.lat || !wp.lon) {
                    console.warn(
                      `⚠️ Skipping invalid waypoint at index ${index}`,
                      wp
                    );
                    return null;
                  }

                  return (
                    <Marker
                      key={index}
                      position={{ lat: wp.lat, lng: wp.lon }}
                      onClick={() => {
                        setSelectedWaypoint(index);
                        recenterOnGPS();
                      }}
                      icon={
                        wp.iconSrc
                          ? {
                              url: wp.iconSrc,
                              scaledSize: new google.maps.Size(40, 40),
                              anchor: new google.maps.Point(20, 20),
                            }
                          : {
                              path: google.maps.SymbolPath.CIRCLE,
                              scale: 10,
                              fillColor: isFollowingGPS ? "#4285F4" : "#FF6B35",
                              fillOpacity: 1,
                              strokeColor: "#ffffff",
                              strokeWeight: 3,
                            }
                      }
                      title={`Current Location ${
                        isFollowingGPS ? "(Following)" : "(Free)"
                      }`}
                      label={{
                        text: (index + 1).toString(),
                        color: "white",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    />
                  );
                })}

                {/* Enhanced route polyline */}
                {routePath.length > 1 && (
                  <Polyline
                    path={routePath}
                    options={{
                      strokeColor: "#FF0000",
                      strokeOpacity: 0.8,
                      strokeWeight: 4,
                      geodesic: true,
                    }}
                  />
                )}

                {/* Tracking polyline (auto-recorded GPS points) */}
                {trackingPoints.length > 1 && (
                  <Polyline
                    path={trackingPoints.map((pt) => ({
                      lat: pt.lat,
                      lng: pt.lon,
                    }))}
                    options={{
                      strokeColor: "#00FF00",
                      strokeOpacity: 0.6,
                      strokeWeight: 2,
                      geodesic: true,
                    }}
                  />
                )}

                {/* Enhanced info window */}
                {selectedWaypoint !== null && waypoints[selectedWaypoint] && (
                  <InfoWindow
                    position={{
                      lat: waypoints[selectedWaypoint].lat,
                      lng: waypoints[selectedWaypoint].lon,
                    }}
                    onCloseClick={() => setSelectedWaypoint(null)}
                  >
                    <div className="p-2 max-w-xs">
                      <div className="flex items-center mb-2">
                        {waypoints[selectedWaypoint].iconSrc && (
                          <img
                            src={waypoints[selectedWaypoint].iconSrc}
                            alt={waypoints[selectedWaypoint].name}
                            className="w-6 h-6 mr-2"
                          />
                        )}
                        <strong className="text-lg">
                          {waypoints[selectedWaypoint].name}
                        </strong>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div>
                          <strong>Time:</strong>{" "}
                          {waypoints[selectedWaypoint].timestamp}
                        </div>
                        <div>
                          <strong>Position:</strong>{" "}
                          {waypoints[selectedWaypoint].lat.toFixed(6)},{" "}
                          {waypoints[selectedWaypoint].lon.toFixed(6)}
                        </div>
                        <div>
                          <strong>Distance from start:</strong>{" "}
                          {waypoints[selectedWaypoint].distance} km
                        </div>
                        {waypoints[selectedWaypoint].poi && (
                          <div>
                            <strong>Notes:</strong>{" "}
                            {waypoints[selectedWaypoint].poi}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          // Future: Add edit functionality
                          alert("Edit functionality coming soon!");
                        }}
                        className="mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Edit
                      </button>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            </>
          )}
        </div>
      )}
      <p></p>

      {/* Route Info */}
      <div>
        <h2 className="text-lg font-semibold mb-2">
          📝 Survey Trip: Day {currentDay} - {todayDate}
        </h2>
        <div className="flex flex-wrap gap-2 mb-2">
          {/* New Day Selector */}
          <div className="flex flex-col justify-end">
            <div className="flex items-center gap-3">
              <span className="px-3 py-2 bg-blue-100 border rounded text-center font-bold min-w-16">
                Day {currentDay}
              </span>
              <button
                className="bg-blue-600 text-white px-2 py-2 rounded text-sm hover:bg-blue-700"
                onClick={handleNewDay}
                title="Start new day"
              >
                📅 New Day
              </button>
            </div>
          </div>

          {/* New Route Button */}
          <div className="flex flex-col justify-end">
            <button
              className="bg-brown-600 text-white px-3 py-2 rounded hover:bg-green-700 text-sm"
              onClick={handleNewRoute}
              title="Start new route"
            >
              🗺️ New Route
            </button>
          </div>

          {/* Route Name Input */}
          <div className="flex flex-col flex-1">
            <input
              className="flex-1 p-2 border rounded text-black bg-gray-100 text-sm"
              placeholder={`Day ${currentDay} - Route ${currentRoute}`}
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
            />
          </div>

          {/* Stage Input */}
          <div className="flex flex-col">
            <input
              className="p-2 border rounded2 text-sm"
              placeholder="Stage Number"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            />
          </div>

          {/* Stage Toggle Button */}
          <div className="flex flex-col justify-end">
            {!stageStarted ? (
              // Start Stage Button (Green)
              <button
                className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                onClick={() => {
                  if (waypoints.length > 0) {
                    setShowStartstageConfirm(true);
                  } else {
                    handleStartstage();
                  }
                }}
                disabled={stageLoading || !currentGPS}
              >
                {stageLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Starting...
                  </>
                ) : (
                  <>▶️ Start Stage</>
                )}
              </button>
            ) : (
              // End Stage Button (Red)
              <button
                className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-red-600 disabled:cursor-not-allowed text-sm
                "
                onClick={() => setShowEndstageConfirm(true)}
                disabled={waypoints.length === 0}
              >
                ⏹ End Stage
              </button>
            )}
          </div>
        </div>
      </div>

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
