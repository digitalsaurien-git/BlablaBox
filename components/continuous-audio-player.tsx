"use client";

import { useEffect, useRef, useState } from "react";

type SegmentedPlaybackStatus = "loading" | "ready" | "playing" | "paused" | "error";

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function createAudioContext(): AudioContext {
  const AudioContextConstructor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Web Audio API indisponible dans ce navigateur.");
  }
  return new AudioContextConstructor();
}

function formatSegmentError(index: number, cause: unknown): Error {
  const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : "";
  return new Error(`La partie audio ${index + 1} est indisponible.${detail}`);
}

export function ContinuousAudioPlayer({ sources }: { sources: string[] }) {
  const segmented = sources.length > 1;
  const sourceKey = sources.join("\n");
  const sourceListRef = useRef(sources);
  const audioContextRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<AudioBuffer[]>([]);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const loadPromiseRef = useRef<Promise<AudioBuffer[]> | null>(null);
  const generationRef = useRef(0);
  const scheduleGenerationRef = useRef(0);
  const startedAtRef = useRef(0);
  const startedOffsetRef = useRef(0);
  const offsetRef = useRef(0);
  const durationRef = useRef(0);
  const isPlayingRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [status, setStatus] = useState<SegmentedPlaybackStatus>("loading");

  function stopScheduledSources() {
    scheduleGenerationRef.current += 1;
    isPlayingRef.current = false;
    for (const source of scheduledSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // A source which has already ended cannot be stopped a second time.
      }
      source.disconnect();
    }
    scheduledSourcesRef.current = [];
  }

  async function preloadSegments(sourceList: string[], generation: number): Promise<AudioBuffer[]> {
    const audioContext = audioContextRef.current ?? createAudioContext();
    audioContextRef.current = audioContext;
    const buffers = await Promise.all(
      sourceList.map(async (source, index) => {
        let response: Response;
        try {
          response = await fetch(source);
        } catch (cause) {
          throw formatSegmentError(index, cause);
        }
        if (!response.ok) {
          throw formatSegmentError(index, new Error(`Réponse réseau ${response.status}.`));
        }
        try {
          const encoded = await response.arrayBuffer();
          return await audioContext.decodeAudioData(encoded);
        } catch (cause) {
          throw formatSegmentError(index, cause);
        }
      }),
    );
    if (generation !== generationRef.current) {
      throw new Error("Le chargement audio a été interrompu.");
    }
    buffersRef.current = buffers;
    durationRef.current = buffers.reduce((total, buffer) => total + buffer.duration, 0);
    setCurrentIndex(0);
    setPlaybackError(null);
    setStatus("ready");
    return buffers;
  }

  function startPreload(sourceList: string[], generation: number) {
    const promise = preloadSegments(sourceList, generation).catch((cause) => {
      if (generation === generationRef.current) {
        const message = cause instanceof Error ? cause.message : "Le chargement audio a échoué.";
        setPlaybackError(message);
        setStatus("error");
      }
      throw cause;
    });
    loadPromiseRef.current = promise;
    return promise;
  }

  function positionForOffset(offset: number, buffers: AudioBuffer[]) {
    let remaining = offset;
    for (let index = 0; index < buffers.length; index += 1) {
      if (remaining < buffers[index].duration || index === buffers.length - 1) {
        return { index, localOffset: Math.max(0, remaining) };
      }
      remaining -= buffers[index].duration;
    }
    return { index: 0, localOffset: 0 };
  }

  function scheduleFrom(offset: number) {
    const audioContext = audioContextRef.current;
    const buffers = buffersRef.current;
    if (!audioContext || buffers.length === 0) {
      return;
    }

    stopScheduledSources();
    const scheduleGeneration = scheduleGenerationRef.current;
    const startTime = audioContext.currentTime + 0.03;
    const { index: firstIndex, localOffset } = positionForOffset(offset, buffers);
    let nextStartTime = startTime;
    const scheduled: AudioBufferSourceNode[] = [];

    for (let index = firstIndex; index < buffers.length; index += 1) {
      const buffer = buffers[index];
      const offsetInBuffer = index === firstIndex ? Math.min(localOffset, buffer.duration) : 0;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      const remainingDuration = Math.max(0, buffer.duration - offsetInBuffer);
      source.start(nextStartTime, offsetInBuffer);
      nextStartTime += remainingDuration;
      source.onended = () => {
        if (scheduleGeneration !== scheduleGenerationRef.current || !isPlayingRef.current || index >= buffers.length - 1) {
          return;
        }
        setCurrentIndex(index + 1);
      };
      scheduled.push(source);
    }

    const lastSource = scheduled[scheduled.length - 1];
    if (!lastSource) {
      return;
    }
    lastSource.onended = () => {
      if (scheduleGeneration !== scheduleGenerationRef.current || !isPlayingRef.current) {
        return;
      }
      isPlayingRef.current = false;
      offsetRef.current = 0;
      setCurrentIndex(0);
      setStatus("ready");
      scheduledSourcesRef.current = [];
    };
    scheduledSourcesRef.current = scheduled;
    setCurrentIndex(firstIndex);
    startedAtRef.current = startTime;
    startedOffsetRef.current = offset;
    offsetRef.current = offset;
    isPlayingRef.current = true;
    setPlaybackError(null);
    setStatus("playing");
  }

  function pauseSegmentedPlayback() {
    const audioContext = audioContextRef.current;
    if (!audioContext || !isPlayingRef.current) {
      return;
    }
    const elapsed = Math.max(0, audioContext.currentTime - startedAtRef.current);
    offsetRef.current = Math.min(durationRef.current, startedOffsetRef.current + elapsed);
    const { index } = positionForOffset(offsetRef.current, buffersRef.current);
    setCurrentIndex(index);
    stopScheduledSources();
    setStatus("paused");
    void audioContext.suspend().catch(() => undefined);
  }

  async function handleSegmentedPlay() {
    if (isPlayingRef.current) {
      pauseSegmentedPlayback();
      return;
    }

    try {
      const audioContext = audioContextRef.current ?? createAudioContext();
      audioContextRef.current = audioContext;
      // This must stay in the user click handler for autoplay policies, especially iOS Safari.
      await audioContext.resume();
      let buffers = buffersRef.current;
      if (buffers.length !== sourceListRef.current.length) {
        const generation = generationRef.current;
        let pendingLoad = loadPromiseRef.current ?? startPreload(sourceListRef.current, generation);
        try {
          buffers = await pendingLoad;
        } catch {
          loadPromiseRef.current = null;
          setStatus("loading");
          try {
            pendingLoad = startPreload(sourceListRef.current, generation);
            buffers = await pendingLoad;
          } catch {
            setStatus("error");
            return;
          }
        }
      }
      if (buffers.length === 0) {
        throw new Error("Aucun segment audio disponible.");
      }
      scheduleFrom(Math.min(offsetRef.current, durationRef.current));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "La lecture audio a échoué.";
      setPlaybackError(message);
      setStatus("error");
    }
  }

  useEffect(() => {
    sourceListRef.current = sources;
  }, [sourceKey, sources]);

  useEffect(() => {
    if (!segmented) {
      return undefined;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    sourceListRef.current = sources;
    buffersRef.current = [];
    offsetRef.current = 0;
    durationRef.current = 0;
    setCurrentIndex(0);
    setPlaybackError(null);
    setStatus("loading");
    startPreload(sources, generation).catch(() => undefined);

    return () => {
      generationRef.current += 1;
      stopScheduledSources();
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      loadPromiseRef.current = null;
      if (audioContext) {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, [segmented, sourceKey]);

  useEffect(() => {
    return () => {
      stopScheduledSources();
      const audioContext = audioContextRef.current;
      if (audioContext) {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, []);

  if (sources.length === 0) return null;

  if (!segmented) {
    return (
      <div className="grid gap-3">
        <audio controls preload="metadata" className="w-full" src={sources[0]}>
          Votre navigateur ne prend pas en charge la lecture audio.
        </audio>
        <a
          href={`${sources[0]}?download=1`}
          className="inline-flex w-fit items-center justify-center rounded-xl border border-ink/15 bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-moss hover:text-moss"
        >
          Télécharger le MP3
        </a>
      </div>
    );
  }

  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const buttonLabel = isLoading ? "Chargement…" : isPlaying ? "Pause" : status === "paused" ? "Reprendre" : "Lecture";

  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink/60" aria-live="polite">
        Lecture continue — partie {currentIndex + 1} sur {sources.length}
      </p>
      <button
        type="button"
        onClick={() => void handleSegmentedPlay()}
        disabled={isLoading}
        className="inline-flex w-fit items-center justify-center rounded-xl bg-moss px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-moss/90 disabled:cursor-wait disabled:opacity-60"
      >
        {buttonLabel}
      </button>
      <p className="text-sm text-ink/60" aria-live="polite">
        {isLoading ? "Préparation des segments audio…" : "Les segments sont décodés puis programmés dans l’ordre."}
      </p>
      {playbackError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          {playbackError}
        </p>
      ) : null}
      <div className="grid gap-2">
        <p className="text-sm leading-6 text-ink/60">
          Le téléchargement reste composé de {sources.length} MP3 ordonnés. Aucune concaténation MP3 fragile n&apos;est effectuée.
        </p>
        <div className="flex flex-wrap gap-2">
          {sources.map((source, index) => (
            <a
              key={source}
              href={`${source}&download=1`}
              className="inline-flex items-center justify-center rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm font-semibold text-ink transition hover:border-moss hover:text-moss"
            >
              Télécharger la partie {index + 1}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
