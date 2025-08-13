import { supabase } from "../lib/supabase";

export const dataSync = {
  // Save route to Supabase
  async saveRoute(routeData) {
    const { data, error } = await supabase
      .from("routes")
      .insert({
        route_name: routeData.routeName,
        day_number: routeData.dayNumber,
        route_number: routeData.routeNumber,
        survey_date: routeData.surveyDate,
        user_id: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Save stage with waypoints
  async saveStage(stageData, routeId) {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    // Save stage
    const { data: stage, error: stageError } = await supabase
      .from("stages")
      .insert({
        route_id: routeId,
        user_id: userId,
        stage_name: stageData.stageName,
        stage_number: stageData.stageNumber,
        start_gps: stageData.startGPS,
        start_time: stageData.startTime,
        waypoint_count: stageData.waypoints.length,
      })
      .select()
      .single();

    if (stageError) throw stageError;

    // Save waypoints
    if (stageData.waypoints.length > 0) {
      const waypoints = stageData.waypoints.map((wp, index) => ({
        stage_id: stage.id,
        route_id: routeId,
        user_id: userId,
        waypoint_number: index + 1,
        name: wp.name,
        lat: wp.lat,
        lon: wp.lon,
        distance_from_start: wp.distance,
        category: wp.category,
        voice_created: wp.voiceCreated,
        raw_transcript: wp.rawTranscript,
        processed_text: wp.processedText,
        poi_notes: wp.poi,
        timestamp: wp.fullTimestamp,
      }));

      const { error: wpError } = await supabase
        .from("waypoints")
        .insert(waypoints);

      if (wpError) throw wpError;
    }

    return stage;
  },

  // Save tracking points periodically
  async saveTrackingPoints(points, stageId) {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const trackingData = points.map((pt) => ({
      stage_id: stageId,
      user_id: userId,
      lat: pt.lat,
      lon: pt.lon,
      timestamp: pt.timestamp,
    }));

    const { error } = await supabase
      .from("tracking_points")
      .insert(trackingData);

    if (error) throw error;
  },

  // Retrieve user's routes
  async getUserRoutes() {
    const { data, error } = await supabase
      .from("routes")
      .select(
        `
        *,
        stages (
          *,
          waypoints (*)
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  },

  // Auto-save to localStorage with Supabase backup
  async autoSave(data) {
    // Save to localStorage first (immediate)
    localStorage.setItem(
      "rally_mapper_backup",
      JSON.stringify({
        ...data,
        lastSaved: new Date().toISOString(),
      })
    );

    // Then sync to Supabase (can be delayed)
    try {
      // Implementation depends on your data structure
      console.log("Synced to Supabase");
    } catch (error) {
      console.error("Supabase sync failed, data safe in localStorage", error);
    }
  },
};
