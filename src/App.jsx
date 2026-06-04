import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

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
  const [tracks, setTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [uploadMessage, setUploadMessage] = useState(
    "Upload lagu terbaru untuk masuk ke lineup GariZ.",
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingUploads, setPendingUploads] = useState([]);

  const selectedTrack = useMemo(
    () =>
      tracks.find((track) => track.id === selectedTrackId) ?? tracks[0] ?? null,
    [selectedTrackId, tracks],
  );

  const revokeTrackSource = (source) => {
    if (!source || !source.startsWith("blob:")) {
      return;
    }

    URL.revokeObjectURL(source);
    localUrlsRef.current = localUrlsRef.current.filter((url) => url !== source);
  };

  const handleDeleteTrack = (trackId) => {
    const trackToDelete = tracks.find((track) => track.id === trackId);

    if (!trackToDelete) {
      return;
    }

    const remainingTracks = tracks.filter((track) => track.id !== trackId);

    revokeTrackSource(trackToDelete.source);
    setTracks(remainingTracks);

    if (selectedTrackId === trackId) {
      setSelectedTrackId(remainingTracks[0]?.id ?? null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
    }
  };

  const handleConfirmDeleteTrack = (track) => {
    const shouldDelete = window.confirm(
      `Yakin ingin hapus lagu "${track.title}" dari list?`,
    );

    if (!shouldDelete) {
      return;
    }

    handleDeleteTrack(track.id);
  };

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
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const preparePendingUploads = (files) => {
    const pending = files.map((file, index) => ({
      id: Date.now() + index,
      file,
      title: file.name.replace(/\.[^.]+$/, ""),
      blobUrl: URL.createObjectURL(file),
    }));
    setPendingUploads(pending);
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    preparePendingUploads(files);
    event.target.value = "";
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files).filter((f) =>
      f.type.startsWith("audio/"),
    );
    if (!files.length) return;
    preparePendingUploads(files);
  };

  const handlePendingTitleChange = (id, title) => {
    setPendingUploads((cur) =>
      cur.map((item) => (item.id === id ? { ...item, title } : item)),
    );
  };

  const handleConfirmUpload = () => {
    const nextTracks = pendingUploads.map((item, index) => {
      localUrlsRef.current.push(item.blobUrl);
      return {
        id: item.id,
        title: item.title.trim() || item.file.name.replace(/\.[^.]+$/, ""),
        artist: "Upload terbaru",
        mood: "Fresh drop",
        duration: "Baru saja",
        source: item.blobUrl,
        accent:
          index % 3 === 0
            ? "linear-gradient(135deg, #1ed760, #0f766e)"
            : index % 3 === 1
              ? "linear-gradient(135deg, #7cf7c2, #14532d)"
              : "linear-gradient(135deg, #22c55e, #064e3b)",
      };
    });
    setTracks((cur) => [...nextTracks, ...cur]);
    setSelectedTrackId(nextTracks[0].id);
    setUploadMessage(`${nextTracks.length} lagu baru berhasil diunggah.`);
    setPendingUploads([]);
  };

  const handleCancelUpload = () => {
    pendingUploads.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    setPendingUploads([]);
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
          </div>

          <div
            className={`drop-zone${isDragOver ? " drop-zone--over" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            aria-label="Drop file audio atau klik untuk pilih file"
            onClick={() => document.getElementById("track-upload").click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("track-upload").click();
              }
            }}
          >
            <span className="drop-zone-icon" aria-hidden="true">
              ♪
            </span>
            <span className="drop-zone-label">
              Drag &amp; drop atau <strong>klik untuk pilih file</strong>
            </span>
            <span className="drop-zone-hint">
              Format audio: MP3, WAV, OGG, FLAC, dll
            </span>
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
            {selectedTrack ? (
              <>
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
              </>
            ) : (
              <>
                <h2>Belum ada lagu</h2>
                <p>Upload atau tambahkan lagu dulu untuk mulai memutar sesi.</p>
              </>
            )}
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
                <div
                  key={track.id}
                  className={`track-row ${isActive ? "active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTrackId(track.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedTrackId(track.id);
                    }
                  }}
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
                  <button
                    type="button"
                    className="track-delete"
                    aria-label={`Hapus lagu ${track.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleConfirmDeleteTrack(track);
                    }}
                  >
                    Hapus
                  </button>
                </div>
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

      {pendingUploads.length > 0 && (
        <div
          className="upload-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Edit judul lagu sebelum upload"
        >
          <div className="upload-modal">
            <h3 className="upload-modal-title">Edit judul lagu</h3>
            <p className="upload-modal-subtitle">
              {pendingUploads.length} file siap diunggah. Atur judul sebelum
              masuk ke library.
            </p>
            <div className="upload-modal-list">
              {pendingUploads.map((item) => (
                <div key={item.id} className="upload-modal-item">
                  <span className="upload-modal-filename">
                    {item.file.name}
                  </span>
                  <input
                    type="text"
                    className="upload-modal-input"
                    value={item.title}
                    placeholder="Judul lagu..."
                    onChange={(e) =>
                      handlePendingTitleChange(item.id, e.target.value)
                    }
                  />
                </div>
              ))}
            </div>
            <div className="upload-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleCancelUpload}
              >
                Batal
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmUpload}
              >
                Tambah ke Library
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
