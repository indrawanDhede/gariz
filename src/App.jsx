import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const initialTracks = [
  {
    id: 1,
    title: "Midnight Pulse",
    artist: "GariZ Internal",
    mood: "Hype",
    duration: "3:18",
    accent: "linear-gradient(135deg, #1ed760, #0f6f3d)",
  },
  {
    id: 2,
    title: "Backstage Bloom",
    artist: "GariZ Session",
    mood: "Chill",
    duration: "2:44",
    accent: "linear-gradient(135deg, #7cf7c2, #134e4a)",
  },
  {
    id: 3,
    title: "Neon Rehearsal",
    artist: "GariZ Crew",
    mood: "Focus",
    duration: "4:02",
    accent: "linear-gradient(135deg, #36d399, #0f766e)",
  },
];

const createDemoTrackUrl = () => {
  const sampleRate = 22050;
  const durationSeconds = 12;
  const totalSamples = sampleRate * durationSeconds;
  const samples = new Int16Array(totalSamples);
  const notes = [110, 146.83, 164.81, 130.81];

  for (let index = 0; index < totalSamples; index += 1) {
    const time = index / sampleRate;
    const beatPhase = time % 0.5;
    const note = notes[Math.floor(time / 1.5) % notes.length];
    const kick =
      Math.sin(2 * Math.PI * 56 * time) * Math.exp(-beatPhase * 18) * 0.42;
    const bass = Math.sin(2 * Math.PI * note * time) * 0.18;
    const pad =
      Math.sin(2 * Math.PI * note * 0.5 * time + Math.sin(time * 0.8)) * 0.12;
    const shimmer = Math.sin(2 * Math.PI * note * 2 * time) * 0.06;
    const noise = Math.sin(index * 12.9898) * 43758.5453;
    const percussive =
      (noise - Math.floor(noise) - 0.5) * Math.exp(-beatPhase * 28) * 0.08;
    const sample = kick + bass + pad + shimmer + percussive;

    samples[index] = Math.max(-1, Math.min(1, sample)) * 32767;
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset, string) => {
    for (let position = 0; position < string.length; position += 1) {
      view.setUint8(offset + position, string.charCodeAt(position));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;

  samples.forEach((sample) => {
    view.setInt16(offset, sample, true);
    offset += 2;
  });

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
};

const formatTime = (value) => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

function App() {
  const audioRef = useRef(null);
  const localUrlsRef = useRef([]);
  const demoTrackSource = useMemo(() => createDemoTrackUrl(), []);
  const [tracks, setTracks] = useState(() => {
    return [
      {
        ...initialTracks[0],
        source: demoTrackSource,
      },
      ...initialTracks.slice(1),
    ];
  });
  const [selectedTrackId, setSelectedTrackId] = useState(initialTracks[0].id);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [uploadMessage, setUploadMessage] = useState(
    "Upload lagu terbaru untuk masuk ke lineup GariZ.",
  );

  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) ?? tracks[0],
    [selectedTrackId, tracks],
  );

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !selectedTrack?.source) {
      return undefined;
    }

    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    audio.src = selectedTrack.source;

    return undefined;
  }, [selectedTrack]);

  useEffect(() => {
    const urls = localUrlsRef.current;

    return () => {
      URL.revokeObjectURL(demoTrackSource);
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [demoTrackSource]);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    const nextTracks = files.map((file, index) => {
      const source = URL.createObjectURL(file);
      localUrlsRef.current.push(source);

      return {
        id: Date.now() + index,
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "Upload terbaru",
        mood: "Fresh drop",
        duration: "Baru saja",
        source,
        accent:
          index % 3 === 0
            ? "linear-gradient(135deg, #1ed760, #0f766e)"
            : index % 3 === 1
              ? "linear-gradient(135deg, #7cf7c2, #14532d)"
              : "linear-gradient(135deg, #22c55e, #064e3b)",
      };
    });

    setTracks((currentTracks) => [...nextTracks, ...currentTracks]);
    setSelectedTrackId(nextTracks[0].id);
    setUploadMessage(`${nextTracks.length} lagu baru berhasil diunggah.`);
    event.target.value = "";
  };

  const handlePlayPause = async () => {
    const audio = audioRef.current;

    if (!audio || !selectedTrack?.source) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">GariZ Audio Room</p>
          <h1>Tempat dengerin, upload, dan push lagu internal band GariZ.</h1>
          <p className="hero-text">
            Nuansa Spotify yang clean, gelap, dan tajam. Upload lagu terbaru,
            pilih track, lalu putar langsung dari workspace ini.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handlePlayPause}
            >
              {isPlaying ? "Pause session" : "Play highlight"}
            </button>
            <label className="secondary-button" htmlFor="track-upload">
              Upload lagu terbaru
            </label>
            <input
              id="track-upload"
              className="upload-input"
              type="file"
              accept="audio/*"
              multiple
              onChange={handleFileChange}
            />
          </div>

          <p className="upload-status">{uploadMessage}</p>

          <div className="hero-stats">
            <article>
              <strong>{tracks.length}</strong>
              <span>track di library</span>
            </article>
            <article>
              <strong>Gen Z</strong>
              <span>visual style</span>
            </article>
            <article>
              <strong>100%</strong>
              <span>internal vibes</span>
            </article>
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-card-glow" />
          <div className="now-playing">
            <span className="now-tag">Now playing</span>
            <h2>{selectedTrack.title}</h2>
            <p>{selectedTrack.artist}</p>

            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>

            <div className="progress-meta">
              <span>{formatTime(currentTime)}</span>
              <span>{selectedTrack.duration}</span>
            </div>

            <button
              type="button"
              className="mini-button"
              onClick={handlePlayPause}
            >
              {isPlaying ? "Jeda" : "Putar"} track
            </button>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <section className="library-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Music library</p>
              <h2>Track list GariZ</h2>
            </div>
            <span className="badge">Live upload ready</span>
          </div>

          <div className="track-list">
            {tracks.map((track, index) => {
              const isActive = track.id === selectedTrackId;

              return (
                <button
                  key={track.id}
                  type="button"
                  className={`track-row ${isActive ? "active" : ""}`}
                  onClick={() => setSelectedTrackId(track.id)}
                >
                  <span className="track-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="track-art"
                    style={{ background: track.accent }}
                  />
                  <span className="track-copy">
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                  </span>
                  <span className="track-chip">{track.mood}</span>
                  <span className="track-duration">{track.duration}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="insight-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Release desk</p>
              <h2>Upload terbaru</h2>
            </div>
          </div>

          <div className="release-card">
            <p className="release-title">Workflow cepat</p>
            <p>
              Pilih file audio dari laptop, lalu file itu langsung muncul di
              urutan teratas. Cocok buat review internal, sesi rehearsal, atau
              rilis demo terbaru.
            </p>
          </div>

          <div className="release-card release-card-compact">
            <p className="release-title">Status sesi</p>
            <div className="session-state">
              <span className="pulse" />
              <span>{isPlaying ? "Sedang diputar" : "Siap diputar"}</span>
            </div>
            <p className="tiny-copy">
              Audio tersambung ke pemutar bawaan browser.
            </p>
          </div>
        </aside>
      </section>

      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
      />
    </main>
  );
}

export default App;
