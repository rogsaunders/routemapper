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
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthCallback from "./routes/AuthCallback";
// near the top with your map imports

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

        await navigator.share({
          files: [file],
          title: title,
          text: `Rally route export: ${filename}`,
        });

        console.log("✅ Share sheet successful");
        return { success: true, method: "share_sheet" };
      } catch (shareErr) {
        console.log("⚠️ Share sheet failed:", shareErr.message);
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
        document.body.appendChild(a);
        a.click();
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

const GOOGLE_MAPS_LIBRARIES = [];

function Home({ user, isGuestMode }) {
  const [syncStatus, setSyncStatus] = useState(
    isGuestMode ? "offline" : "online"
  );
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyCYZchsHu_Sd4KMNP1b6Dq30XzWWOuFPO8",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const [currentRecognition, setCurrentRecognition] = useState(null);
  const [routeName, setRouteName] = useState("");
  const [startGPS, setStartGPS] = useState(null);
  const [stage, setstage] = useState([]);
  const [stageSummaries, setstageSummaries] = useState([]);
  const [stageName, setstageName] = useState("Stage 1");
  const [trackingPoints, setTrackingPoints] = useState([]);
  const [routeWaypoints, setWaypoints] = useState([]);
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
  const [dayRoutes, setDayRoutes] = useState([]);
  const [currentRoute, setCurrentRoute] = useState(1);
  const [editingWaypoint, setEditingWaypoint] = useState(null);
  const [editValues, setEditValues] = useState({ name: "", poi: "" });
  const [selectedWaypoints, setSelectedWaypoints] = useState(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState(null);
  const [waypointAdded, setWaypointAdded] = useState(false);
  const [stageLoading, setstageLoading] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimeLeft, setUndoTimeLeft] = useState(5);
  const [showVoiceInstructions, setShowVoiceInstructions] = useState(false);
  const [mapType, setMapType] = useState("roadmap");
  const [showRouteStats, setShowRouteStats] = useState(false);
  const [mapZoom, setMapZoom] = useState(15);
  const [isFollowingGPS, setIsFollowingGPS] = useState(true);
  const [staticMapCenter, setStaticMapCenter] = useState(null);
  const [userHasInteractedWithMap, setUserHasInteractedWithMap] =
    useState(false);
  const [continuousListening, setContinuousListening] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);

  const handleSignOut = async () => {
    try {
      if (user !== "guest") {
        await supabase.auth.signOut();
      } else {
        // For guest mode, you might want to reload the page or redirect
        localStorage.removeItem("guestMode");
        window.location.reload();
      }
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  // Add this useEffect to set initial sync status
  useEffect(() => {
    if (user === "guest" || isGuestMode) {
      setSyncStatus("offline");
    } else if (user) {
      setSyncStatus("online");
    }
  }, [user, isGuestMode]);

  useEffect(() => {
    if (user === "guest" || isGuestMode) {
      setSyncStatus("offline");
    } else if (user) {
      setSyncStatus("online");
    }
  }, [user, isGuestMode]);

  // Auto-save to Supabase
  useEffect(() => {
    if (user && user !== "guest" && routeWaypoints.length > 0) {
      const saveTimer = setTimeout(() => {
        dataSync
          .autoSave({ routeWaypoints, trackingPoints, routeName })
          .then(() => setSyncStatus("synced"))
          .catch(() => setSyncStatus("error"));
      }, 5000);

      return () => clearTimeout(saveTimer);
    }
  }, [routeWaypoints, user, trackingPoints, routeName]);

  useEffect(() => {
    return () => {
      // Cleanup function to stop recognition when component unmounts
      if (currentRecognition) {
        currentRecognition.stop();
        setCurrentRecognition(null);
      }
    };
  }, [currentRecognition]);

  // Load saved routeWaypoints
  useEffect(() => {
    const stored = localStorage.getItem("unsavedWaypoints");
    if (stored) {
      setWaypoints(JSON.parse(stored));
    }
  }, []);

  // GPS tracking
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
    };

    const handleError = (err) => {
      console.error("⌐ GPS error", err);
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
      timeout: 30000,
      maximumAge: 0,
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
    if (routeWaypoints.length > 0) {
      localStorage.setItem("unsavedWaypoints", JSON.stringify(routeWaypoints));
    }
  }, [routeWaypoints]);

  useEffect(() => {
    console.log("Waypoints changed:", routeWaypoints);
  }, [routeWaypoints]);

  useEffect(() => {
    if (waypointListRef.current) {
      waypointListRef.current.scrollTop = waypointListRef.current.scrollHeight;
    }
  }, [routeWaypoints]);

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

            setCurrentGPS({ lat: newPoint.lat, lon: newPoint.lon });
            console.log("📍 Auto-tracked:", newPoint);
          },
          (err) => console.error("❌ GPS error", err),
          { enableHighAccuracy: true, timeout: 30000 }
        );
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [isTracking, currentGPS]);

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
    if (routeWaypoints.length > 0 || routeName.trim() !== "") {
      const confirmNewDay = window.confirm(
        `Start Day ${
          currentDay + 1
        }? This will clear all current day data (routes, stages, routeWaypoints). Make sure you've exported your current data first.`
      );

      if (!confirmNewDay) return;
    }

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

    localStorage.removeItem("unsavedWaypoints");

    console.log(`📅 Started Day ${currentDay + 1}`);
  };

  const handleNewRoute = () => {
    if (routeWaypoints.length > 0 || routeName.trim() !== "") {
      const confirmNewRoute = window.confirm(
        `Start new route? This will clear current route data (stages, routeWaypoints). Make sure you've exported your current route first.`
      );

      if (!confirmNewRoute) return;
    }

    setCurrentRoute((prev) => prev + 1);
    setRouteName("");
    setWaypoints([]);
    setTrackingPoints([]);
    setstageCount(1);
    setstageStarted(false);
    setIsTracking(false);
    setTotalDistance(0);

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
    const fullTimestamp = now.toISOString();

    const cumulativeDistance = startGPS
      ? calculateCumulativeDistance(
          routeWaypoints,
          currentGPS.lat,
          currentGPS.lon
        )
      : 0;

    setTotalDistance(cumulativeDistance);

    const waypoint = {
      name: "Unnamed",
      lat: currentGPS.lat,
      lon: currentGPS.lon,
      timestamp,
      fullTimestamp,
      distance: cumulativeDistance,
      poi: "",
    };
    setWaypoints((prev) => [...prev, waypoint]);

    setWaypointAdded(true);
    setTimeout(() => setWaypointAdded(false), 2000);

    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

    console.log("✅ Waypoint added:", waypoint);

    setShowUndo(true);
    setUndoTimeLeft(5);
  };

  const handleStartstage = () => {
    setstageLoading(true);
    setstageStarted(true);
    setIsTracking(true);
    setTrackingPoints([]);
    setWaypoints([]);
    setTotalDistance(0);
    setIsFollowingGPS(true);
    setUserHasInteractedWithMap(false);

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
        setstage((prev) => [...prev, { name: stageName, routeWaypoints: [] }]);
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
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  };

  const mapCenter = (() => {
    if (!isFollowingGPS && userHasInteractedWithMap) {
      return undefined;
    }

    if (isFollowingGPS && currentGPS) {
      return { lat: currentGPS.lat, lng: currentGPS.lon };
    }

    if (routeWaypoints.length > 0) {
      return { lat: routeWaypoints[0].lat, lng: routeWaypoints[0].lon };
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
    console.log("🗺️ Map drag ended - position maintained");
  };

  const recenterOnGPS = () => {
    if (currentGPS) {
      console.log("🎯 Re-centering on current GPS");
      setIsFollowingGPS(true);
      setUserHasInteractedWithMap(false);
      setRefreshKey((prev) => prev + 1);
    }
  };

  const handleMapZoomChanged = (map) => {
    if (map) {
      const newZoom = map.getZoom();
      setMapZoom(newZoom);
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

    if (
      cleanText.includes("stage start") ||
      cleanText.includes("start stage")
    ) {
      if (routeWaypoints.length > 0) {
        setShowStartstageConfirm(true);
      } else {
        handleStartstage();
      }
      return;
    }

    if (cleanText.includes("stage end") || cleanText.includes("end stage")) {
      if (stageStarted) {
        setShowEndstageConfirm(true);
      } else {
        setGpsError("No active stage to end.");
        setTimeout(() => setGpsError(null), 1000);
      }
      return;
    }

    if (stageStarted) {
      processVoiceCommand(transcript);
    } else {
      setGpsError("Start a stage first to add routeWaypoints.");
      setTimeout(() => setGpsError(null), 1000);
    }
  };

  const detectCategory = (description) => {
    const text = description.toLowerCase();

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

    const corrections = {
      write: "right",
      wright: "right",
      rite: "right",
      lift: "left",
      laugh: "left",
      strait: "straight",
      "straight ahead": "straight",
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
      "gravel road": "gravel",
      "tarmac road": "tarmac",
      "sealed road": "tarmac",
      "dirt road": "dirt",
      unsealed: "gravel",
      "next to k": "next 2k",
      "next 2 k": "next 2k",
      "next two k": "next 2k",
      "for 1k": "for 1k",
      "for one k": "for 1k",
      "turn left": "left turn",
      "turn right": "right turn",
      "keep going left": "keep left",
      "keep going right": "keep right",
      "carry straight": "keep straight",
      "continue straight": "keep straight",
    };

    for (const [wrong, right] of Object.entries(corrections)) {
      corrected = corrected.replace(new RegExp(wrong, "gi"), right);
    }

    return corrected;
  };

  const expandRallyTerms = (text) => {
    let expanded = text;

    const expansions = {
      l: "left",
      r: "right",
      str: "straight",
      kr: "keep right",
      kl: "keep left",
      ks: "keep straight",
      cg: "cattle grid",
      wg: "wire gate",
      fg: "fence gate",
      br: "bridge",
      fd: "ford",
      xing: "crossing",
      gr: "gravel",
      tar: "tarmac",
      conc: "concrete",
      dt: "dirt",
      rgh: "rough",
      sth: "smooth",
      dngr: "danger",
      caut: "caution",
      bump: "bump",
      hole: "hole",
      wo: "washout",
      "1k": "1k",
      "2k": "2k",
      "3k": "3k",
      "4k": "4k",
      "5k": "5k",
    };

    for (const [abbrev, full] of Object.entries(expansions)) {
      const regex = new RegExp(`\\b${abbrev}\\b`, "gi");
      expanded = expanded.replace(regex, full);
    }

    return expanded;
  };

  const getSpeedContext = () => {
    if (trackingPoints.length < 2) return "unknown";

    const recent = trackingPoints.slice(-2);
    const timeDiff =
      (new Date(recent[1].timestamp) - new Date(recent[0].timestamp)) / 1000;
    const distance =
      parseFloat(
        calculateDistance(
          recent[0].lat,
          recent[0].lon,
          recent[1].lat,
          recent[1].lon
        )
      ) * 1000;

    const speedMPS = distance / timeDiff;
    const speedKMH = speedMPS * 3.6;

    if (speedKMH > 80) return "fast";
    if (speedKMH > 40) return "medium";
    if (speedKMH > 10) return "slow";
    return "stationary";
  };

  const contextualProcessing = (text, speed) => {
    let processed = text;

    switch (speed) {
      case "fast":
        processed = processed
          .replace(/followed by/g, "→")
          .replace(/next stage/g, "next")
          .replace(/approximately/g, "~");
        break;
      case "medium":
        break;
      case "slow":
        processed = processed
          .replace(/→/g, "followed by")
          .replace(/~/g, "approximately");
        break;
      default:
        break;
    }

    return processed;
  };

  const processVoiceCommand = (transcript) => {
    const cleanText = transcript.trim().toLowerCase();
    console.log("🗣️ Voice input:", cleanText);

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
    const fullTimestamp = now.toISOString();

    const cumulativeDistance = startGPS
      ? calculateCumulativeDistance(
          routeWaypoints,
          currentGPS.lat,
          currentGPS.lon
        )
      : 0;

    setTotalDistance(cumulativeDistance);

    const waypoint = {
      name: formattedName,
      lat: currentGPS.lat,
      lon: currentGPS.lon,
      timestamp,
      fullTimestamp,
      distance: cumulativeDistance,
      poi: "",
      iconSrc: "",
      category: detectCategory(formattedName),
      voiceCreated: true,
      rawTranscript: description,
      processedText: formattedName,
      speedContext: speed,
    };

    setWaypoints((prev) => {
      const updated = [...prev, waypoint];
      console.log(
        `✅ Voice waypoint added. Total waypoints: ${updated.length}`
      );
      console.log(
        `📍 New waypoint at: ${waypoint.lat.toFixed(6)}, ${waypoint.lon.toFixed(
          6
        )}`
      );
      return updated;
    });

    setWaypointAdded(true);
    setTimeout(() => setWaypointAdded(false), 2000);
    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

    // Force map to re-render and show the new waypoint
    setRefreshKey((prev) => {
      console.log(`🔄 Refreshing map (key: ${prev} -> ${prev + 1})`);
      return prev + 1;
    });

    setShowUndo(true);
    setUndoTimeLeft(5);
  };

  const startEditingWaypoint = (index) => {
    setEditingWaypoint(index);
    setEditValues({
      name: routeWaypoints[index].name,
      poi: routeWaypoints[index].poi || "",
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
    setSelectedWaypoints(new Set());
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
    if (selectedWaypoints.size === routeWaypoints.length) {
      setSelectedWaypoints(new Set());
    } else {
      setSelectedWaypoints(new Set(routeWaypoints.map((_, index) => index)));
    }
  };

  const deleteSelectedWaypoints = () => {
    if (selectedWaypoints.size === 0) return;

    const confirmDelete = window.confirm(
      `Delete ${selectedWaypoints.size} selected waypoint${
        selectedWaypoints.size !== 1 ? "s" : ""
      }? This cannot be undone.`
    );

    if (!confirmDelete) return;

    const indicesToDelete = Array.from(selectedWaypoints).sort((a, b) => b - a);

    setWaypoints((prev) => {
      let updated = [...prev];
      indicesToDelete.forEach((index) => {
        updated.splice(index, 1);
      });
      return updated;
    });

    setSelectedWaypoints(new Set());
    setBulkSelectMode(false);

    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

    console.log(`🗑️ Deleted ${selectedWaypoints.size} routeWaypoints`);
  };

  const handleUndoLastWaypoint = () => {
    if (routeWaypoints.length === 0) return;

    setWaypoints((prev) => prev.slice(0, -1));

    setShowUndo(false);
    setUndoTimeLeft(5);

    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

    console.log("↩️ Last waypoint undone");
  };

  const exportAsJSON = async (
    waypointsData = routeWaypoints,
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
        routeWaypoints: waypointsData.map((wp, index) => ({
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
    waypointsData = routeWaypoints,
    trackingData = trackingPoints,
    name = "stage"
  ) => {
    try {
      console.log("🔍 Starting Simple JSON export (iPad compatible)...");

      const data = {
        name: routeName || name,
        stageName: stageName,
        date: new Date().toISOString(),
        routeWaypoints: waypointsData.map((wp, index) => ({
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
    waypointsData = routeWaypoints,
    trackingData = trackingPoints,
    name = "route"
  ) => {
    try {
      console.log("🔍 Starting GPX export (iPad compatible)...");

      const gpxContent = buildGPX(waypointsData, trackingData, name);
      console.log("🔍 GPX content length:", gpxContent.length);

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
    waypointsData = routeWaypoints,
    trackingData = trackingPoints,
    name = "route"
  ) => {
    try {
      console.log(
        "🔍 Starting Rally Navigator GPX export (iPad compatible)..."
      );

      const rallyGPX = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1" creator="RallyMapper-Voice" xmlns="http://www.topografix.com/GPX/1/1">
      <metadata>
        <n>${name}</n>
        <desc>Rally route with voice instructions - ${
          waypointsData.length
        } routeWaypoints</desc>
        <time>${new Date().toISOString()}</time>
      </metadata>
      
      <!-- Waypoints with Rally Navigator friendly format -->
      ${waypointsData
        .map((wp, index) => {
          const waypointNumber = (index + 1).toString().padStart(3, "0");
          return `
      <wpt lat="${wp.lat}" lon="${wp.lon}">
        <n>${waypointNumber} - ${wp.name}</n>
        <desc>${wp.name}</desc>
        <cmt>Rally instruction: ${wp.name} at ${wp.distance}km</cmt>
        <type>waypoint</type>
      </wpt>`;
        })
        .join("")}

      <!-- Route with turn instructions -->
      <rte>
        <n>${name} Instructions</n>
        <desc>Rally route with ${waypointsData.length} instruction points</desc>
        ${waypointsData
          .map((wp, index) => {
            const waypointNumber = (index + 1).toString().padStart(3, "0");
            return `
        <rtept lat="${wp.lat}" lon="${wp.lon}">
          <n>${waypointNumber} - ${wp.name}</n>
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
        <n>${name} Track</n>
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

  const exportAsKML = async (
    waypointsData = routeWaypoints,
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

  const handleEndstage = async () => {
    try {
      setstageStarted(false);
      setUndoTimeLeft(5);
      setIsFollowingGPS(true);

      const stageNameFormatted = `${todayDate}/Stage ${stageCount}`;
      const currentstage = { name: stageNameFormatted, routeWaypoints };

      const summary = {
        name: stageNameFormatted,
        waypointCount: routeWaypoints.length,
        startTime: routeWaypoints[0]?.timestamp || "N/A",
        endTime: routeWaypoints[routeWaypoints.length - 1]?.timestamp || "N/A",
        totalDistance: routeWaypoints
          .reduce((sum, wp) => sum + parseFloat(wp.distance || 0), 0)
          .toFixed(2),
        pois: [...new Set(routeWaypoints.map((wp) => wp.poi).filter(Boolean))],
        startCoords: routeWaypoints[0]
          ? `${routeWaypoints[0].lat.toFixed(
              5
            )}, ${routeWaypoints[0].lon.toFixed(5)}`
          : "N/A",
        endCoords: routeWaypoints[routeWaypoints.length - 1]
          ? `${routeWaypoints[routeWaypoints.length - 1].lat.toFixed(
              5
            )}, ${routeWaypoints[routeWaypoints.length - 1].lon.toFixed(5)}`
          : "N/A",
        routeName: routeName || "Unnamed Route",
      };

      setstage((prev) => [...prev, currentstage]);
      setstageSummaries((prev) => [...prev, summary]);

      setGpsError("📤 Exporting files (iPad compatible)...");

      const exportName = routeName || stageNameFormatted;

      console.log("🔍 === MAIN EXPORT PROCESS START ===");
      console.log("Export name:", exportName);
      console.log("Waypoints:", routeWaypoints.length);
      console.log("Tracking points:", trackingPoints.length);

      // SUPABASE INTEGRATION (if user is logged in)
      if (user && user !== "guest") {
        try {
          setSyncStatus("syncing");

          let routeId = localStorage.getItem("current_route_id");
          if (!routeId) {
            const route = await dataSync.saveRoute({
              routeName: routeName || `Day ${currentDay} Route ${currentRoute}`,
              dayNumber: currentDay,
              routeNumber: currentRoute,
              surveyDate: todayDate,
            });
            routeId = route.id;
            localStorage.setItem("current_route_id", routeId);
          }

          const stageData = await dataSync.saveStage(
            {
              stageName: stageNameFormatted,
              stageNumber: stageCount,
              startGPS: startGPS,
              startTime: routeWaypoints[0]?.fullTimestamp,
              routeWaypoints: routeWaypoints,
            },
            routeId
          );

          if (trackingPoints.length > 0 && stageData?.id) {
            await dataSync.saveTrackingPoints(trackingPoints, stageData.id);
          }

          setSyncStatus("synced");
          console.log("✅ Data saved to Supabase");
        } catch (error) {
          console.error("Supabase save failed:", error);
          setSyncStatus("error");
        }
      }

      // Export files locally
      const exportResults = [];

      try {
        console.log("📤 Starting sequential exports...");

        const json1 = await exportAsJSON(
          routeWaypoints,
          trackingPoints,
          exportName
        );
        exportResults.push(json1);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const json2 = await exportAsSimpleJSON(
          routeWaypoints,
          trackingPoints,
          exportName
        );
        exportResults.push(json2);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const gpx = await exportAsGPX(
          routeWaypoints,
          trackingPoints,
          exportName
        );
        exportResults.push(gpx);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const kml = await exportAsKML(
          routeWaypoints,
          trackingPoints,
          exportName
        );
        exportResults.push(kml);

        console.log("📤 All sequential exports completed");
      } catch (error) {
        console.error("❌ Sequential export failed:", error);
      }

      const successCount = exportResults.filter((r) => r && r.success).length;

      console.log("🔍 Export results:", exportResults);
      console.log("🔍 === MAIN EXPORT PROCESS END ===");

      if (successCount === exportResults.length) {
        setGpsError("✅ All 4 files exported successfully!");
      } else if (successCount > 0) {
        const formatNames = ["Enhanced JSON", "Simple JSON", "GPX", "KML"];
        const successful = exportResults
          .map((result, i) => (result?.success ? formatNames[i] : null))
          .filter(Boolean);
        const failed = exportResults
          .map((result, i) => (!result?.success ? formatNames[i] : null))
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

      setTimeout(() => setGpsError(null), 10000);

      setRefreshKey((prev) => prev + 1);
      setIsTracking(false);
      localStorage.removeItem("unsavedWaypoints");

      if (routeWaypoints.length === 0) {
        localStorage.removeItem("current_route_id");
      }

      console.log("Stage ended and exports completed.");
    } catch (error) {
      console.error("❌ handleEndstage error:", error);
      setGpsError("❌ Stage end failed. Check console.");
      setTimeout(() => setGpsError(null), 5000);
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

  const routePath = routeWaypoints.map((wp) => ({
    lat: wp.lat,
    lng: wp.lon,
  }));

  const routeDistance =
    routeWaypoints.length > 0
      ? routeWaypoints[routeWaypoints.length - 1].distance
      : 0;
  const routeStats = {
    totalWaypoints: routeWaypoints.length,
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

  const mapTypes = [
    { key: "roadmap", label: "Road", icon: "🗺️" },
    { key: "satellite", label: "Satellite", icon: "🛰️" },
    { key: "terrain", label: "Terrain", icon: "⛰️" },
    { key: "hybrid", label: "Hybrid", icon: "🔀" },
  ];

  const GPSStatus = () => {
    if (gpsError) {
      return (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-2">
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
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-2">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
            <span>Acquiring GPS signal... Please wait.</span>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-green-500 mr-2">📍</span>
            <span>GPS Active</span>
          </div>
          <div className="text-sm">
            <span className="mr-3">
              {currentGPS.lat.toFixed(6)}, {currentGPS.lon.toFixed(6)}
            </span>
            : Accuracy: ±{gpsAccuracy ? Math.round(gpsAccuracy) : "?"}m
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
                ? " Excellent"
                : gpsAccuracy <= 50
                ? " Good"
                : " Poor"}
            </span>
          </div>
        </div>
      </div>
    );
  };

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
            This will clear your current {routeWaypoints.length} waypoint
            {routeWaypoints.length !== 1 ? "s" : ""} and start fresh. Make sure
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
            This will export your route data and clear current routeWaypoints.
            This action cannot be undone.
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

  const MapControls = () => (
    <>
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
    if (!showRouteStats || routeWaypoints.length === 0) {
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
      {showUserProfile && (
        <UserProfile
          user={user}
          onClose={() => setShowUserProfile(false)}
          onAccountDeleted={() => {
            setUser(null);
            setIsGuestMode(false);
          }}
        />
      )}

      {/* Sync Status Indicator */}
      <div className="fixed top-4 right-4 z-50">
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            {user && user !== "guest" && (
              <button
                onClick={() => setShowUserProfile(true)}
                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
              >
                👤 {user.email?.split("@")[0] || "User"}
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
            >
              {user === "guest" ? "Exit Guest" : "Sign Out"}
            </button>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-2 ${
              syncStatus === "synced"
                ? "bg-green-100 text-green-800"
                : syncStatus === "syncing"
                ? "bg-yellow-100 text-yellow-800"
                : syncStatus === "error"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {syncStatus === "synced" && "☁️ Saved"}
            {syncStatus === "syncing" && "🔄 Syncing..."}
            {syncStatus === "error" && "⚠️ Sync Error"}
            {syncStatus === "offline" &&
              (isGuestMode ? "🔒 Guest Mode" : "💾 Local Only")}
          </div>
        </div>
      </div>

      <WaypointSuccessNotification />
      <EndstageConfirmDialog />
      <StartstageConfirmDialog />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-blue-800 flex items-center gap-2">
          <img src="/RRM Logo 64x64.png" className="w-8 h-8" alt="RRM Logo" />
          Rally Mapper
        </h1>
      </div>

      <GPSStatus />

      <div className="flex gap-4 mb-2">
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

        {showReplay && <ReplayRoute routeWaypoints={routeWaypoints} />}

        <button
          onClick={recenterOnGPS}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg ${
            isFollowingGPS
              ? "bg-brown-600 text-white hover:bg-blue-700"
              : "bg-green-600 text-white hover:bg-green-700"
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
              <MapControls />
              <RouteStatsOverlay />

              <GoogleMap
                key={refreshKey}
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={mapCenter}
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
                }}
                onLoad={(map) => {
                  console.log("Map loaded");
                  window.rallyMap = map;
                }}
              >
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

                {gpsAccuracy && (
                  <Circle
                    center={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                    radius={gpsAccuracy}
                    options={{
                      fillColor: isFollowingGPS ? "#4285F4" : "#FF6B35",
                      fillOpacity: 0.1,
                      strokeColor: isFollowingGPS ? "#4285F4" : "#FF6B35",
                      strokeOpacity: 0.3,
                      strokeWeight: 1,
                    }}
                  />
                )}

                {routeWaypoints.map((wp, index) => {
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
                      onMouseOver={() => {
                        setSelectedWaypoint(index);
                      }}
                      onMouseOut={() => {
                        setSelectedWaypoint(null);
                      }}
                      onClick={() => {
                        setSelectedWaypoint(index);
                      }}
                      label={{
                        text: (index + 1).toString(),
                        color: "white",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    />
                  );
                })}

                {trackingPoints.length > 1 && (
                  <Polyline
                    path={trackingPoints.map((pt) => ({
                      lat: pt.lat,
                      lng: pt.lon,
                    }))}
                    options={{
                      strokeColor: "#FF0000",
                      strokeOpacity: 0.7,
                      strokeWeight: 2, // thin line
                      geodesic: true,
                    }}
                  />
                )}

                {selectedWaypoint !== null &&
                  routeWaypoints[selectedWaypoint] && (
                    <InfoWindow
                      position={{
                        lat: routeWaypoints[selectedWaypoint].lat,
                        lng: routeWaypoints[selectedWaypoint].lon,
                      }}
                      onCloseClick={() => setSelectedWaypoint(null)}
                    >
                      <div className="p-2 max-w-xs">
                        <div className="flex items-center mb-2">
                          <strong className="text-lg">
                            {routeWaypoints[selectedWaypoint].name}
                          </strong>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div>
                            <strong>Time:</strong>{" "}
                            {routeWaypoints[selectedWaypoint].timestamp}
                          </div>
                          <div>
                            <strong>Position:</strong>{" "}
                            {routeWaypoints[selectedWaypoint].lat.toFixed(6)},{" "}
                            {routeWaypoints[selectedWaypoint].lon.toFixed(6)}
                          </div>
                          <div>
                            <strong>Distance from start:</strong>{" "}
                            {routeWaypoints[selectedWaypoint].distance} km
                          </div>
                          {routeWaypoints[selectedWaypoint].poi && (
                            <div>
                              <strong>Notes:</strong>{" "}
                              {routeWaypoints[selectedWaypoint].poi}
                            </div>
                          )}
                        </div>
                      </div>
                    </InfoWindow>
                  )}
              </GoogleMap>
            </>
          )}
        </div>
      )}

      <p></p>

      <div>
        <h2 className="text-lg font-semibold mb-2">
          📝 Survey Trip: Day {currentDay} - {todayDate}
        </h2>
        <div className="flex flex-wrap gap-2 mb-2">
          <div className="flex flex-col justify-end">
            <div className="flex items-center gap-3">
              <span className="px-3 py-2 bg-blue-100 border rounded text-sm font-bold min-w-16">
                Day {currentDay}
              </span>
              <button
                className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700"
                onClick={handleNewDay}
                title="Start new day"
              >
                📅 New Day
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <button
              className="bg-brown-600 text-white px-3 py-2 rounded hover:bg-green-700 text-sm"
              onClick={handleNewRoute}
              title="Start new route"
            >
              🗺️ New Route
            </button>
          </div>

          <div className="flex flex-col flex-1">
            <input
              className="flex-1 p-2 border rounded text-black bg-gray-100 text-sm"
              placeholder={`Day ${currentDay} - Route ${currentRoute}`}
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <input
              className="flex-1 p-2 border rounded text-black bg-gray-100 text-sm"
              placeholder="Stage Number"
              value={stageName}
              onChange={(e) => setstageName(e.target.value)}
            />
          </div>

          <div className="flex flex-col justify-end">
            {!stageStarted ? (
              <button
                className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                onClick={() => {
                  if (routeWaypoints.length > 0) {
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
              <button
                className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-red-600 disabled:cursor-not-allowed text-sm"
                onClick={() => setShowEndstageConfirm(true)}
                disabled={routeWaypoints.length === 0}
              >
                ⏹ End Stage
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-center items-center gap-4 my-4 flex-wrap">
          <div
            style={{
              width: "96px",
              height: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "black",
              color: "white",
              //border: "2px solid #1e3a8a",
              borderRadius: "8px",
              fontWeight: "bold",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              padding: "16px",
            }}
          >
            <span
              style={{
                fontSize: "1.0rem",
                textAlign: "center",
                lineHeight: "1.2",
                padding: "8px",
              }}
            >
              {totalDistance.toFixed(2)} km
            </span>
          </div>

          <button
            onClick={handleAddWaypoint}
            type="button"
            disabled={!currentGPS || !stageStarted}
            style={{
              padding: "10px 10px",
              borderRadius: "8px",
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
              //border: "2px solid #1e3a8a",
            }}
          >
            {waypointAdded ? <>✅ Added!</> : <>📍 Add Waypoint</>}
          </button>

          {showUndo && (
            <button
              onClick={handleUndoLastWaypoint}
              type="button"
              style={{
                padding: "10px 10px",
                borderRadius: "8px",
                fontSize: "1rem",
                backgroundColor: "#EF4444",
                color: "white",
                //border: "2px solid #1e3a8a",
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
              padding: "10px 10px",
              borderRadius: "8px",
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
              //border: "2px solid #1e3a8a",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          >
            {recognitionActive ? (
              <>
                <div className="w-4 h-4 bg-white rounded-full animate-pulse"></div>
                Listening...
              </>
            ) : (
              <>🎤 Add Location</>
            )}
          </button>

          <button
            style={{
              padding: "10px 10px",
              borderRadius: "8px",
              fontSize: "1.0rem",
              backgroundColor: !stageStarted ? "#e98547" : "#D1D5DB",
              color: "white",
              //border: "2px solid #1e3a8a",
              cursor: !stageStarted ? "not-allowed" : "pointer",
            }}
            onClick={() => alert("Photo feature not yet implemented")}
            type="button"
            disabled={!stageStarted}
          >
            📷 Photo
          </button>

          {isTracking && (
            <div className="flex items-center text-green-600 font-bold">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-ping mr-2"></div>
              📍 Tracking...(Points: {trackingPoints.length})
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: window.innerWidth >= 768 ? "row" : "column",
            gap: "24px",
            marginTop: "24px",
          }}
        >
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

              {routeWaypoints.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {bulkSelectMode && (
                    <>
                      <span className="text-sm text-gray-600">
                        {selectedWaypoints.size} selected
                      </span>
                      <button
                        onClick={selectAllWaypoints}
                        className="px-2 py-1 bg-blue-500 text-black rounded text-xs hover:bg-blue-600"
                      >
                        {selectedWaypoints.size === routeWaypoints.length
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                      {selectedWaypoints.size > 0 && (
                        <button
                          onClick={deleteSelectedWaypoints}
                          className="px-2 py-1 bg-red-500 text-black rounded text-xs hover:bg-red-600"
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
                        ? "bg-gray-500 text-black hover:bg-gray-600"
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
              {routeWaypoints.length === 0 ? (
                <p className="text-gray-500">No route Waypoints added yet.</p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {routeWaypoints.map((wp, idx) => (
                    <div key={idx} className="bg-gray-100 p-3 rounded">
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

const UserProfile = ({ user, onClose, onAccountDeleted }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    displayName: user?.user_metadata?.full_name || "",
    email: user?.email || "",
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleUpdateProfile = async () => {
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: profile.displayName },
      });
      if (error) throw error;
      setMessage("Profile updated successfully!");
      setIsEditing(false);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setMessage("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setMessage("Password changed successfully!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">User Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {message && (
          <div
            className={`p-3 rounded mb-4 ${
              message.includes("Error")
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {message}
          </div>
        )}

        {/* Profile Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Profile Information</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Display Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={profile.displayName}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      displayName: e.target.value,
                    }))
                  }
                  className="w-full p-2 border rounded"
                />
              ) : (
                <p className="p-2 bg-gray-50 rounded">
                  {profile.displayName || "Not set"}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <p className="p-2 bg-gray-50 rounded">{profile.email}</p>
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleUpdateProfile}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "Updating..." : "Save Changes"}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Password Change Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Change Password</h3>
          <div className="space-y-3">
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full p-2 border rounded"
            />
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2 border rounded"
            />
            <button
              onClick={handleChangePassword}
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Changing..." : "Change Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

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

function App() {
  const [user, setUser] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [guest, setGuest] = React.useState(false);

  React.useEffect(() => {
    let sub;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setAuthLoading(false);
      const ch = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        setAuthLoading(false);
      });
      sub = ch?.data?.subscription;
    })();
    return () => {
      try {
        sub?.unsubscribe?.();
      } catch {}
    };
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Checking session…</p>
        </div>
      </div>
    );
  }

  if (!user && !guest) {
    return <Auth onGuest={() => setGuest(true)} />;
  }

  return <Home user={user} isGuestMode={!user && guest} />;
}

export default App;
