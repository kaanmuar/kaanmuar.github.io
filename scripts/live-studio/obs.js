#!/usr/bin/env node
/* The OBS path for the live studio (#3140), for going live from OBS Studio instead of run.js's own RTMP push.

     node scripts/live-studio/obs.js [--port 8793]

   Writes to media/live-studio/obs/:
     QA-lab Live Studio.json   a scene collection (Scene Collection > Import): "Show" is the studio's browser source alone,
                               "Show + camera" adds a camera bubble over the bottom of the frame for Carlos on camera
     profile/basic.ini         a 1080x1920, 30 fps profile with 2 s keyframes (Profile > Import, pick the profile folder)
     profile/service.json      a custom RTMP server, filled from TIKTOK_RTMP_URL/KEY or INSTAGRAM_RTMP_URL/KEY when set
                               (OBS 30+ also streams to several platforms through its multistream plugins)
   Then run node scripts/live-studio/run.js --obs [--loop] [--comments ...]: OBS's browser source opens the show from
   it, and the page plays the voices and the bed, so "Control audio via OBS" carries them to the stream. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { OUT } = require("./studio");

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 8793) || 8793;
const dir = path.join(OUT, "obs");
const uuid = () => crypto.randomUUID();
const SHOW = "Live studio show";
const CAMERA = "Camera";

function source(id, name, settings, extra) {
  return Object.assign({ id, versioned_id: id, name, uuid: uuid(), settings, enabled: true, flags: 0, mixers: 255, muted: false, volume: 1.0,
    monitoring_type: 0, private_settings: {}, filters: [], hotkeys: {}, sync: 0, balance: 0.5, push_to_mute: false, push_to_talk: false }, extra || {});
}

function item(src, id, pos, scale, bounds) {
  return Object.assign({ name: src.name, source_uuid: src.uuid, visible: true, locked: false, rot: 0.0, id, pos, scale, align: 5,
    bounds_type: bounds ? 2 : 0, bounds_align: 0, bounds: bounds || { x: 0, y: 0 }, crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0,
    scale_filter: "disable", blend_method: "default", blend_type: "normal", show_transition: {}, hide_transition: {}, private_settings: {} });
}

function scene(name, items) {
  return source("scene", name, { custom_size: false, id_counter: items.length, items });
}

function rtmp() {
  for (const key of ["TIKTOK", "INSTAGRAM"]) {
    const url = process.env[key + "_RTMP_URL"];
    const secret = process.env[key + "_RTMP_KEY"];
    if (url && secret) return { server: url, key: secret };
  }
  return { server: "rtmp://<paste the server URL from TikTok LIVE Studio or Instagram Live Producer>", key: "" };
}

function main() {
  fs.mkdirSync(path.join(dir, "profile"), { recursive: true });
  const show = source("browser_source", SHOW, {
    url: "http://127.0.0.1:" + port + "/scripts/live-studio/show.html?sse=/live/events&audio=1",
    width: 1080, height: 1920, fps: 30, fps_custom: true, reroute_audio: true, restart_when_active: false, shutdown: false, css: ""
  });
  const camera = source("av_capture_input", CAMERA, { preset: "AVCaptureSessionPreset1280x720" }, { versioned_id: "av_capture_input_v2" });
  const plain = scene("Show", [item(show, 1, { x: 0, y: 0 }, { x: 1, y: 1 })]);
  const withCam = scene("Show + camera", [
    item(show, 1, { x: 0, y: 0 }, { x: 1, y: 1 }),
    item(camera, 2, { x: 56, y: 1560 }, { x: 1, y: 1 }, { x: 420, y: 320 })
  ]);
  const collection = {
    name: "QA-lab Live Studio",
    current_scene: "Show", current_program_scene: "Show", current_transition: "Fade", transition_duration: 400,
    scene_order: [{ name: "Show" }, { name: "Show + camera" }],
    sources: [show, camera, plain, withCam],
    groups: [], quick_transitions: [], transitions: [], saved_projectors: [], modules: {}, preview_locked: false, scaling_enabled: false
  };
  fs.writeFileSync(path.join(dir, "QA-lab Live Studio.json"), JSON.stringify(collection, null, 1));
  fs.writeFileSync(path.join(dir, "profile", "basic.ini"), [
    "[General]", "Name=QA-lab Live Studio", "",
    "[Video]", "BaseCX=1080", "BaseCY=1920", "OutputCX=1080", "OutputCY=1920", "FPSType=1", "FPSInt=30", "FPSCommon=30", "", "[Audio]", "SampleRate=44100", "ChannelSetup=Stereo", "",
    "[Output]", "Mode=Advanced", "",
    "[AdvOut]", "Encoder=obs_x264", "RecFormat2=mp4", "RecEncoder=none", "TrackIndex=1", "",
    "[SimpleOutput]", "VBitrate=6000", "ABitrate=160", "StreamEncoder=x264", "RecFormat2=mp4", ""
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "profile", "streamEncoder.json"), JSON.stringify({ bitrate: 6000, keyint_sec: 2, preset: "veryfast", profile: "high", rate_control: "CBR" }, null, 1));
  fs.writeFileSync(path.join(dir, "profile", "service.json"), JSON.stringify({ type: "rtmp_custom", settings: Object.assign({ use_auth: false, bwtest: false }, rtmp()) }, null, 1));
  console.log("wrote", dir);
  console.log("OBS: Scene Collection > Import > " + path.join(dir, "QA-lab Live Studio.json"));
  console.log("     Profile > Import > " + path.join(dir, "profile"));
  console.log("then: node scripts/live-studio/run.js --obs --loop");
}

main();
