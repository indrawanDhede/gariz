import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./App.css";

const NowPlayingScene = lazy(() => import("./NowPlayingScene"));

const TRACKS_DB_NAME = "gariz_tracks_db";
const TRACKS_STORE_NAME = "tracks";
const CLOUD_BUCKET = "gariz-audio";
const accentPalette = [
  "linear-gradient(135deg, #1ed760, #0f766e)",
  "linear-gradient(135deg, #7cf7c2, #14532d)",
  "linear-gradient(135deg, #22c55e, #064e3b)",
];
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasCloudStorageConfig = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = hasCloudStorageConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const getAccentByIndex = (index) => accentPalette[index % accentPalette.length];

const parseCloudTrackTitle = (fileName) => {
  const [prefix] = fileName.split(".");
  const separatorIndex = prefix.indexOf("__");

  if (separatorIndex < 0) {
    return prefix;
  }

  const encodedTitle = prefix.slice(separatorIndex + 2);
  try {
    return decodeURIComponent(encodedTitle);
  } catch {
    return encodedTitle;
  }
};

const sanitizeTitleForPath = (title) =>
  encodeURIComponent(title.replace(/\s+/g, " ").trim()).slice(0, 80);

const openTracksDb = () =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(TRACKS_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACKS_STORE_NAME)) {
        db.createObjectStore(TRACKS_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const saveTrackRecord = async (record) => {
  const db = await openTracksDb();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(TRACKS_STORE_NAME, "readwrite");
    tx.objectStore(TRACKS_STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
};

const readTrackRecords = async () => {
  const db = await openTracksDb();

  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(TRACKS_STORE_NAME, "readonly");
    const request = tx.objectStore(TRACKS_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return records;
};

const deleteTrackRecord = async (trackId) => {
  const db = await openTracksDb();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(TRACKS_STORE_NAME, "readwrite");
    tx.objectStore(TRACKS_STORE_NAME).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
};

const formatTime = (value) => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const verifyCloudFileStored = async (storagePath, attempts = 4) => {
  if (!supabase || !storagePath) {
    return false;
  }

  const slashIndex = storagePath.lastIndexOf("/");
  const folderPath = slashIndex > 0 ? storagePath.slice(0, slashIndex) : "";
  const fileName =
    slashIndex > 0 ? storagePath.slice(slashIndex + 1) : storagePath;
  if (!fileName) {
    return false;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.storage
      .from(CLOUD_BUCKET)
      .list(folderPath, {
        limit: 200,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      });

    const hasFile =
      !error && (data ?? []).some((item) => item.name === fileName);
    if (hasFile) {
      return true;
    }

    if (attempt < attempts - 1) {
      await wait(300 * (attempt + 1));
    }
  }

  return false;
};

function App() {
  const audioRef = useRef(null);
  const localUrlsRef = useRef([]);
  const autoPlayNextRef = useRef(false);
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
  const [isUploading, setIsUploading] = useState(false);
  const [isTrackDragging, setIsTrackDragging] = useState(false);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const hydrateLocalTracks = async () => {
      const records = await readTrackRecords();
      if (!isMounted) return;

      const hydratedTracks = records
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((record) => {
          const source = URL.createObjectURL(record.file);
          localUrlsRef.current.push(source);
          return {
            id: record.id,
            title: record.title,
            artist: record.artist,
            mood: record.mood,
            duration: record.duration,
            accent: record.accent,
            source,
          };
        });

      setTracks(hydratedTracks);
      setSelectedTrackId(hydratedTracks[0]?.id ?? null);
    };

    const loadPersistedTracks = async () => {
      try {
        if (hasCloudStorageConfig && supabase) {
          try {
            const { data, error } = await supabase.storage
              .from(CLOUD_BUCKET)
              .list("tracks", {
                limit: 100,
                offset: 0,
                sortBy: { column: "created_at", order: "desc" },
              });

            if (error) {
              throw error;
            }

            const cloudTracks = (data ?? [])
              .filter((item) => item.name && !item.name.endsWith("/"))
              .map((item, index) => {
                const storagePath = `tracks/${item.name}`;
                const {
                  data: { publicUrl },
                } = supabase.storage
                  .from(CLOUD_BUCKET)
                  .getPublicUrl(storagePath);

                return {
                  id: `cloud-${item.id ?? item.name}`,
                  title: parseCloudTrackTitle(item.name),
                  artist: "Cloud upload",
                  mood: "Shared",
                  duration: "Online",
                  accent: getAccentByIndex(index),
                  source: publicUrl,
                  storagePath,
                  isCloud: true,
                };
              });

            if (!isMounted) return;

            setTracks(cloudTracks);
            setSelectedTrackId(cloudTracks[0]?.id ?? null);
            setUploadMessage(
              "Mode cloud aktif. Lagu tersimpan di storage gratis.",
            );
            return;
          } catch {
            if (isMounted) {
              setUploadMessage(
                "Cloud storage tidak bisa diakses. Sementara pakai penyimpanan lokal.",
              );
            }
          }
        }

        await hydrateLocalTracks();
      } catch {
        if (isMounted) {
          setUploadMessage(
            "Gagal memuat storage. Cek koneksi atau konfigurasi cloud storage.",
          );
        }
      }
    };

    loadPersistedTracks();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const handleDeleteTrack = async (trackId) => {
    const trackToDelete = tracks.find((track) => track.id === trackId);

    if (!trackToDelete) {
      return;
    }

    const remainingTracks = tracks.filter((track) => track.id !== trackId);

    revokeTrackSource(trackToDelete.source);
    setTracks(remainingTracks);

    try {
      if (trackToDelete.isCloud && supabase) {
        const { error } = await supabase.storage
          .from(CLOUD_BUCKET)
          .remove([trackToDelete.storagePath]);

        if (error) throw error;
      } else {
        await deleteTrackRecord(trackId);
      }
    } catch {
      setUploadMessage(
        "Lagu terhapus dari list, tapi gagal sinkron ke storage.",
      );
    }

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

  const handleConfirmDeleteTrack = async (track) => {
    const shouldDelete = window.confirm(
      `Yakin ingin hapus lagu "${track.title}" dari list?`,
    );

    if (!shouldDelete) {
      return;
    }

    await handleDeleteTrack(track.id);
  };

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !selectedTrack?.source) {
      return undefined;
    }

    const willAutoPlay = autoPlayNextRef.current;
    autoPlayNextRef.current = false;

    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    audio.src = selectedTrack.source;

    if (willAutoPlay) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }

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
    }));
    setPendingUploads(pending);
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files ?? []).filter((f) =>
      f.type.startsWith("audio/"),
    );

    if (!files.length) {
      setUploadMessage("Pilih file audio (MP3, WAV, OGG, FLAC, dll).");
      event.target.value = "";
      return;
    }

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

  const handleConfirmUpload = async () => {
    if (!pendingUploads.length || isUploading) {
      return;
    }

    const uploadBatch = [...pendingUploads];
    setIsUploading(true);

    try {
      if (hasCloudStorageConfig && supabase) {
        setUploadMessage("Sedang upload lagu ke cloud...");
        const cloudTracks = [];
        let unverifiedCount = 0;

        for (const [index, item] of uploadBatch.entries()) {
          const title =
            item.title.trim() || item.file.name.replace(/\.[^.]+$/, "");
          const extension = item.file.name.includes(".")
            ? item.file.name.slice(item.file.name.lastIndexOf("."))
            : "";
          const safeTitle = sanitizeTitleForPath(title) || `track-${item.id}`;
          const storagePath = `tracks/${item.id}-${index}__${safeTitle}${extension}`;

          const { error } = await supabase.storage
            .from(CLOUD_BUCKET)
            .upload(storagePath, item.file, {
              cacheControl: "3600",
              upsert: false,
              contentType: item.file.type || "audio/mpeg",
            });

          if (error) {
            throw error;
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from(CLOUD_BUCKET).getPublicUrl(storagePath);

          cloudTracks.push({
            id: `cloud-${storagePath}`,
            title,
            artist: "Cloud upload",
            mood: "Shared",
            duration: "Online",
            accent: getAccentByIndex(index),
            source: publicUrl,
            storagePath,
            isCloud: true,
          });

          const isStoredInCloud = await verifyCloudFileStored(storagePath);
          if (!isStoredInCloud) {
            unverifiedCount += 1;
          }
        }

        setTracks((cur) => [...cloudTracks, ...cur]);
        setSelectedTrackId(cloudTracks[0].id);
        if (unverifiedCount > 0) {
          setUploadMessage(
            `${cloudTracks.length} lagu berhasil diupload ke cloud. Verifikasi ${unverifiedCount} lagu masih diproses, refresh sebentar jika belum muncul penuh.`,
          );
        } else {
          setUploadMessage(
            `${cloudTracks.length} lagu berhasil tersimpan dan terverifikasi di cloud.`,
          );
        }
        setPendingUploads([]);
        return;
      }

      const localFallbackTracks = uploadBatch.map((item, index) => {
        const source = URL.createObjectURL(item.file);
        localUrlsRef.current.push(source);
        return {
          id: item.id,
          title: item.title.trim() || item.file.name.replace(/\.[^.]+$/, ""),
          artist: "Upload terbaru",
          mood: "Fresh drop",
          duration: "Baru saja",
          accent: getAccentByIndex(index),
          source,
          file: item.file,
        };
      });

      await Promise.all(
        localFallbackTracks.map((track, index) =>
          saveTrackRecord({
            id: track.id,
            title: track.title,
            artist: track.artist,
            mood: track.mood,
            duration: track.duration,
            accent: track.accent,
            createdAt: Date.now() + index,
            file: track.file,
          }),
        ),
      );

      setTracks((cur) => [...localFallbackTracks, ...cur]);
      setSelectedTrackId(localFallbackTracks[0].id);
      setUploadMessage(
        `${localFallbackTracks.length} lagu baru berhasil diunggah dan tersimpan.`,
      );
      setPendingUploads([]);
    } catch {
      if (hasCloudStorageConfig && supabase) {
        setUploadMessage(
          "Upload cloud gagal. Lagu belum disimpan. Coba lagi sampai verifikasi cloud berhasil.",
        );
      } else {
        setUploadMessage(
          "Upload berhasil dibaca, tapi gagal disimpan. Coba file lebih kecil.",
        );
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelUpload = () => {
    if (isUploading) {
      return;
    }

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

  const handleSeek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(duration, ratio * duration));
  };

  const getTrackIndex = (trackId) =>
    tracks.findIndex((track) => String(track.id) === String(trackId));

  const selectRelativeTrack = (offset, autoPlayRequested = false) => {
    if (!tracks.length) {
      return;
    }

    const currentIndex = getTrackIndex(selectedTrackId);
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeCurrentIndex + offset + tracks.length) % tracks.length;

    if (autoPlayRequested) {
      autoPlayNextRef.current = true;
    }

    setSelectedTrackId(tracks[nextIndex].id);
  };

  const handlePrevTrack = () => {
    selectRelativeTrack(-1, isPlaying);
  };

  const handleNextTrack = () => {
    selectRelativeTrack(1, isPlaying);
  };

  const reorderTracks = (sourceTrackId, targetTrackId) => {
    if (!sourceTrackId || !targetTrackId || sourceTrackId === targetTrackId) {
      return;
    }

    setTracks((currentTracks) => {
      const nextTracks = [...currentTracks];
      const sourceIndex = nextTracks.findIndex(
        (track) => String(track.id) === String(sourceTrackId),
      );
      const targetIndex = nextTracks.findIndex(
        (track) => String(track.id) === String(targetTrackId),
      );

      if (sourceIndex < 0 || targetIndex < 0) {
        return currentTracks;
      }

      const [movedTrack] = nextTracks.splice(sourceIndex, 1);
      nextTracks.splice(targetIndex, 0, movedTrack);
      return nextTracks;
    });
  };

  const handleTrackDragStart = (event, trackId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(trackId));
    setIsTrackDragging(true);
  };

  const handleTrackDragOver = (event, trackId) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTrackId(trackId);
  };

  const handleTrackDrop = (event, targetTrackId) => {
    event.preventDefault();
    const sourceTrackId = event.dataTransfer.getData("text/plain");
    reorderTracks(sourceTrackId, targetTrackId);
    setDragOverTrackId(null);
    setIsTrackDragging(false);
  };

  const handleTrackDragEnd = () => {
    setDragOverTrackId(null);
    setIsTrackDragging(false);
  };

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
          <div className="player-card">
            <div className="player-visual-layer" aria-hidden="true">
              <Suspense
                fallback={
                  <div className="player-visual-fallback">
                    <div className="player-art-icon">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                      </svg>
                    </div>
                  </div>
                }
              >
                <NowPlayingScene
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                />
              </Suspense>
            </div>

            <div className="player-overlay-glow" aria-hidden="true" />

            <div className="player-content">
              <div className="player-info">
                <p className="now-tag">Now playing</p>
                <h2 className="player-title">
                  {selectedTrack?.title ?? "Belum ada lagu"}
                </h2>
                <p className="player-artist">
                  {selectedTrack
                    ? selectedTrack.artist
                    : "Upload lagu untuk mulai"}
                </p>
              </div>

              <div className="player-progress-wrap" onClick={handleSeek}>
                <div className="player-progress-bar">
                  <div
                    className="player-progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                  <div
                    className="player-progress-thumb"
                    style={{ left: `${progress}%` }}
                  />
                </div>
                <div className="player-time">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration || 0)}</span>
                </div>
              </div>

              <div className="player-controls">
                <button
                  type="button"
                  className="player-btn player-btn--sm"
                  aria-label="Lagu sebelumnya"
                  disabled={tracks.length < 2}
                  onClick={handlePrevTrack}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="20"
                    height="20"
                  >
                    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                  </svg>
                </button>

                <button
                  type="button"
                  className="player-btn player-btn--main"
                  aria-label={isPlaying ? "Jeda" : "Putar"}
                  onClick={handlePlayPause}
                >
                  {isPlaying ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      width="28"
                      height="28"
                    >
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      width="28"
                      height="28"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button
                  type="button"
                  className="player-btn player-btn--sm"
                  aria-label="Lagu berikutnya"
                  disabled={tracks.length < 2}
                  onClick={handleNextTrack}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="20"
                    height="20"
                  >
                    <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.4V8.6L8.5 12zM16 6h2v12h-2z" />
                  </svg>
                </button>
              </div>
            </div>
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
                  className={`track-row ${isActive ? "active" : ""} ${
                    isTrackDragging &&
                    String(dragOverTrackId) === String(track.id)
                      ? "drag-over"
                      : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  draggable
                  onClick={() => setSelectedTrackId(track.id)}
                  onDragStart={(event) => handleTrackDragStart(event, track.id)}
                  onDragOver={(event) => handleTrackDragOver(event, track.id)}
                  onDrop={(event) => handleTrackDrop(event, track.id)}
                  onDragEnd={handleTrackDragEnd}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedTrackId(track.id);
                    }
                  }}
                >
                  <span className="track-index">
                    {isActive && isPlaying ? (
                      <span className="eq-bars" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      String(index + 1).padStart(2, "00")
                    )}
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
        onEnded={() => {
          if (tracks.length > 1) {
            selectRelativeTrack(1, true);
            return;
          }

          setIsPlaying(false);
        }}
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
                    disabled={isUploading}
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
                disabled={isUploading}
                onClick={handleCancelUpload}
              >
                Batal
              </button>
              <button
                type="button"
                className="primary-button upload-submit-button"
                disabled={isUploading}
                onClick={handleConfirmUpload}
              >
                {isUploading && (
                  <span className="upload-spinner" aria-hidden="true" />
                )}
                {isUploading
                  ? hasCloudStorageConfig
                    ? "Menyimpan ke Cloud..."
                    : "Menyimpan..."
                  : "Tambah ke Library"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
