"use client";

import { useRef, useState } from "react";

export function ContinuousAudioPlayer({ sources }: { sources: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const segmented = sources.length > 1;

  if (sources.length === 0) return null;

  function handleEnded() {
    const audio = audioRef.current;
    const nextIndex = currentIndex + 1;
    if (audio && nextIndex < sources.length) {
      setCurrentIndex(nextIndex);
      setPlaybackError(null);
      audio.src = sources[nextIndex];
      audio.load();
      void audio.play().catch(() => {
        setPlaybackError("Le navigateur a interrompu l'enchaînement. Appuie sur Lecture pour reprendre.");
      });
      return;
    }
    setCurrentIndex(0);
    if (audio) {
      audio.src = sources[0];
      audio.load();
    }
  }

  return (
    <div className="grid gap-3">
      {segmented ? (
        <p className="text-sm text-ink/60" aria-live="polite">
          Lecture continue — partie {currentIndex + 1} sur {sources.length}
        </p>
      ) : null}
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        className="w-full"
        src={sources[currentIndex]}
        onEnded={handleEnded}
        onPlay={() => setPlaybackError(null)}
      >
        Votre navigateur ne prend pas en charge la lecture audio.
      </audio>
      {playbackError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {playbackError}
        </p>
      ) : null}

      {segmented ? (
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
      ) : (
        <a
          href={`${sources[0]}?download=1`}
          className="inline-flex w-fit items-center justify-center rounded-xl border border-ink/15 bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-moss hover:text-moss"
        >
          Télécharger le MP3
        </a>
      )}
    </div>
  );
}
