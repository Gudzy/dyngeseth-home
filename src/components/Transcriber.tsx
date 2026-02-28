import { useTranscriber, type Language } from "../hooks/useTranscriber";
import styles from "./Transcriber.module.css";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en",   label: "English" },
  { value: "no",   label: "Norsk" },
];

export default function Transcriber() {
  const {
    transcripts,
    listening,
    interim,
    language,
    setLanguage,
    engine,
    isProcessing,
    error,
    canTranscribe,
    toggle,
    deleteTranscript,
    clearAll,
  } = useTranscriber();

  const engineLabel =
    engine === "lytt"    ? "lytt · Whisper"     :
    engine === "cloud"   ? "Cloud · Whisper"    :
    engine === "browser" ? "Browser Speech API" :
    "checking…";

  const engineStatus =
    engine === null                           ? "checking…" :
    engine === "lytt" || engine === "cloud"   ? "connected" :
    "fallback";

  return (
    <section id="transcribe" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Lytt</h2>
            <p className={styles.subtitle}>
              Record your voice — transcribed instantly, saved in your browser.
            </p>
          </div>
          <div className={styles.engineBadge} data-status={engineStatus}>
            <span className={styles.engineDot} />
            <span>{engineLabel}</span>
          </div>
        </div>

        {!canTranscribe && (
          <p className={styles.unsupported}>
            No transcription engine available. Use Chrome or Edge for browser
            fallback.
          </p>
        )}

        {canTranscribe && (
          <>
            <div className={styles.controls}>
              <div className={styles.langSelect}>
                {LANGUAGES.map((l) => (
                  <button
                    key={l.value}
                    className={`${styles.langBtn} ${language === l.value ? styles.langActive : ""}`}
                    onClick={() => setLanguage(l.value)}
                    disabled={listening}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <button
                className={`${styles.micBtn} ${listening ? styles.micActive : ""}`}
                onClick={toggle}
                disabled={isProcessing}
                aria-label={listening ? "Stop recording" : "Start recording"}
              >
                {isProcessing ? (
                  <span className={styles.spinner} />
                ) : listening ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                )}
                <span>
                  {isProcessing ? "Processing…" : listening ? "Stop" : "Record"}
                </span>
                {listening && <span className={styles.recordingDot} />}
              </button>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            {interim && (
              <p className={styles.interim}>
                {interim}
                <span className={styles.cursor}>|</span>
              </p>
            )}

            {transcripts.length > 0 && (
              <div className={styles.list}>
                <div className={styles.listHeader}>
                  <span>
                    {transcripts.length}{" "}
                    {transcripts.length === 1 ? "entry" : "entries"}
                  </span>
                  <button className={styles.clearBtn} onClick={clearAll}>
                    Clear all
                  </button>
                </div>
                {transcripts.map((t) => (
                  <div key={t.id} className={styles.entry}>
                    <p className={styles.entryText}>{t.text}</p>
                    <div className={styles.entryMeta}>
                      <span
                        className={styles.entrySource}
                        data-source={t.source}
                      >
                        {t.source === "browser" ? "◎ browser" : "✦ whisper"}
                      </span>
                      <time className={styles.entryTime}>
                        {new Date(t.createdAt).toLocaleString()}
                      </time>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => deleteTranscript(t.id)}
                        aria-label="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {engine === "browser" && (
              <p className={styles.lyttHint}>
                Using browser speech recognition. For higher-quality
                transcription, install{" "}
                <a
                  href="https://github.com/Smebbs/lytt"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  lytt
                </a>{" "}
                and run <code>lytt serve</code> locally.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
