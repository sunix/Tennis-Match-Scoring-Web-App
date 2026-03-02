import React, { useRef, useState, useEffect } from "react";
import type { VideoInfo } from "../types";

interface Props {
  onVideoInfo: (info: VideoInfo) => void;
  onCurrentTimeChange?: (t: number) => void;
  fpsHint: number;
}

export default function VideoPlayer({ onVideoInfo, onCurrentTimeChange, fpsHint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  function loadFile(file: File) {
    if (src) URL.revokeObjectURL(src);
    const url = URL.createObjectURL(file);
    setSrc(url);
    setFileName(file.name);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/")) loadFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setCurrentTime(v.currentTime);
    onVideoInfo({ name: fileName, duration_s: v.duration, fps_hint: fpsHint });
  }

  function handleTimeUpdate() {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      onCurrentTimeChange?.(videoRef.current.currentTime);
    }
  }

  function handlePlayPause() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function setSpeed(rate: number) {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
      onCurrentTimeChange?.(t);
    }
  }

  function nudge(frames: number) {
    const v = videoRef.current;
    if (!v) return;
    const frameLen = 1 / fpsHint;
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + frames * frameLen));
    setCurrentTime(v.currentTime);
    onCurrentTimeChange?.(v.currentTime);
  }

  function formatTime(t: number): string {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = (t % 60).toFixed(3);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${s.padStart(6, "0")}`;
    return `${String(m).padStart(2, "0")}:${s.padStart(6, "0")}`;
  }

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  return (
    <div className="video-player">
      {!src ? (
        <div
          className={`drop-zone ${isDragging ? "dragging" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <p>🎬 Drop a video file here</p>
          <p>or</p>
          <label className="btn-secondary file-label">
            Choose File
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            src={src}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="video-element"
          />
          <div className="video-controls">
            <div className="video-controls-row">
              <button className="btn-control" onClick={handlePlayPause}>
                {playing ? "⏸" : "▶"}
              </button>
              <button className="btn-control nudge" onClick={() => nudge(-1)} title="-1 frame">
                ◀◀
              </button>
              <button className="btn-control nudge" onClick={() => nudge(1)} title="+1 frame">
                ▶▶
              </button>
              <span className="time-display">{formatTime(currentTime)}</span>
              <div className="speed-buttons">
                {[0.25, 0.5, 1].map((s) => (
                  <button
                    key={s}
                    className="btn-speed"
                    onClick={() => setSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
            <input
              type="range"
              className="seek-bar"
              min={0}
              max={duration}
              step={1 / fpsHint}
              value={currentTime}
              onChange={handleSeek}
            />
            <div className="video-file-name">{fileName}</div>
          </div>
        </>
      )}
    </div>
  );
}
