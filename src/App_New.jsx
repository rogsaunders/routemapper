
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
    console.log(`📁 === STARTING EXPORT: ${filename} ===`);
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
          { enableHighAccuracy: true, timeout: 15000 }
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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 6000 }
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
      cleanText === "mic on" ||
      cleanText === "mike on" ||
      cleanText === "microphone on" ||
      cleanText === "mick on" || // common misrecognition
      cleanText === "make on" || // another common misrecognition
      cleanText === "microphone on" ||
      cleanText.includes("start listening") ||
      cleanText.includes("continuous mode")
    ) {
      console.log("🟢 Mic On command detected - starting continuous listening");
      startContinuousVoiceInput();
      return;
    }

    // Enhanced Mic Off command detection with more variations
    if (
      cleanText === "mic off" ||
      cleanText === "mike off" ||
      cleanText === "microphone off" ||
      cleanText === "mick off" ||
      cleanText === "make off" ||
      cleanText.includes("stop listening") ||
      cleanText.includes("end continuous")
    ) {
      console.log("🔴 Mic Off command detected - stopping recognition");
      stopContinuousListening();
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

  // Add continuous listening mode
  const startContinuousVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    // Stop any existing recognition first
    if (currentRecognition) {
      console.log("🔄 Stopping existing recognition before starting new one");
      currentRecognition.stop();
      setCurrentRecognition(null);
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.continuous = true; // Keep listening
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setCurrentRecognition(recognition);

    recognition.onstart = () => {
      setRecognitionActive(true);
      setContinuousListening(true);
      console.log("🎤 Continuous voice recognition started");
      try {
        new Audio(startSound).play().catch((err) => {
          console.log("Audio play prevented:", err.message);
        });
      } catch (err) {
        console.log("Audio not available");
      }
    };

    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const spokenText = lastResult[0].transcript;
        console.log("🗣️ Continuous voice input:", spokenText);
        processVoiceCommand(spokenText);
      }
    };

    recognition.onerror = (event) => {
      console.error("Continuous voice error:", event.error);

      // Handle specific errors
      switch (event.error) {
        case "no-speech":
          // Ignore no-speech errors in continuous mode, keep listening
          console.log("⚠️ No speech detected, continuing to listen...");
          break;
        case "aborted":
          console.log("🔴 Recognition was aborted");
          setContinuousListening(false);
          setRecognitionActive(false);
          setCurrentRecognition(null);
          break;
        default:
          console.log("❌ Recognition error:", event.error);
          setContinuousListening(false);
          setRecognitionActive(false);
          setCurrentRecognition(null);
          setGpsError(`Voice recognition error: ${event.error}`);
          setTimeout(() => setGpsError(null), 3000);
          break;
      }
    };

    recognition.onend = () => {
      console.log("🎤 Continuous recognition ended");

      // Only restart if we're still supposed to be in continuous listening mode
      if (continuousListening && stageStarted) {
        console.log("🔄 Restarting continuous listening...");
        setTimeout(() => {
          if (continuousListening) {
            // Double-check the flag
            startContinuousVoiceInput();
          }
        }, 500); // Reduced delay for better responsiveness
      } else {
        console.log("🔴 Continuous listening mode ended");
        setRecognitionActive(false);
        setCurrentRecognition(null);
        setContinuousListening(false);
        try {
          new Audio(stopSound).play().catch((err) => {
            console.log("Audio play prevented:", err.message);
          });
        } catch (err) {
          console.log("Audio not available");
        }
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.error("Failed to start recognition:", error);
      setGpsError("Failed to start voice recognition");
      setTimeout(() => setGpsError(null), 3000);
    }
  };

  // New function to properly stop continuous listening
  const stopContinuousListening = () => {
    console.log("🔴 Stopping continuous listening...");
    setContinuousListening(false);
    setRecognitionActive(false);

    if (currentRecognition) {
      try {
        currentRecognition.stop();
        console.log("✅ Recognition stopped successfully");
      } catch (error) {
        console.log("⚠️ Error stopping recognition:", error);
      }
      setCurrentRecognition(null);
    }

    try {
      new Audio(stopSound).play().catch((err) => {
        console.log("Audio play prevented:", err.message);
      });
    } catch (err) {
      console.log("Audio not available");
    }
  };

  // Updated UI button for continuous listening
  const ContinuousListeningButton = () => {
    if (!stageStarted) return null;

    return (
      <button
        onClick={() => {
          console.log("🎤 Mic button clicked!");
          console.log(
            "- Current continuousListening state:",
            continuousListening
          );
          if (continuousListening) {
            console.log("🔴 Stopping continuous listening...");
            stopContinuousListening();
          } else {
            console.log("🟢 Starting continuous listening...");
            startContinuousVoiceInput();
          }
        }}
        type="button"
        style={{
          padding: "10px 10px",
          borderRadius: "8px",
          fontSize: "1.0rem",
          transition: "all 0.2s",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          backgroundColor: continuousListening ? "#EF4444" : "#16a34a",
          color: "white",
          cursor: "pointer",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
        }}
      >
        {continuousListening ? (
          <>
            <div className="w-3 h-4 bg-white rounded-full animate-pulse"></div>
            🔴 Mic Off
          </>
        ) : (
          <>🎤 Mic On</>
        )}
      </button>
    );
  };

  const setRefreshKey((prev) => {
    console.log(`🔄 Refreshing map (key: ${prev} -> ${prev + 1})`);
    return prev + 1;
  });= (description) => {
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
      console.log(`✅ Voice waypoint added. Total waypoints: ${updated.length}`);
      console.log(`📍 New waypoint at: ${waypoint.lat.toFixed(6)}, ${waypoint.lon.toFixed(6)}`);
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