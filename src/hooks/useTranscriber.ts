import { useState, useRef, useEffect, useCallback } from 'react'

export interface Transcript {
  id: string
  text: string
  language: string
  createdAt: string
  source: 'cloud' | 'browser'
}

export type Language = 'en' | 'no' | 'auto'

/** Which transcription engine is active. `null` = still detecting. */
export type Engine = 'cloud' | 'browser' | null

const STORAGE_KEY = 'dyngeseth:transcripts'
const CLOUD_API   = '/api/transcribe'

function loadTranscripts(): Transcript[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveTranscripts(items: Transcript[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

async function checkCloudApi(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Pick the best audio MIME type supported by this browser's MediaRecorder.
 * Whisper accepts webm, mp4, ogg, wav — we try in preference order.
 * Safari does not support audio/webm, so it will fall through to audio/mp4.
 */
function bestSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

/** Derive a file extension from a MIME type string. */
function mimeToExt(mimeType: string): string {
  if (mimeType.includes('mp4'))  return 'mp4'
  if (mimeType.includes('ogg'))  return 'ogg'
  return 'webm'
}

async function transcribeWithCloud(blob: Blob, language: Language): Promise<string> {
  const ext      = mimeToExt(blob.type)
  const formData = new FormData()
  formData.append('file', blob, `recording.${ext}`)
  if (language !== 'auto') {
    formData.append('language', language === 'no' ? 'norwegian' : 'english')
  }
  const res = await fetch(CLOUD_API, { method: 'POST', body: formData })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const data = await res.json() as { text: string }
  return data.text
}

export function useTranscriber() {
  const [transcripts,  setTranscripts]  = useState<Transcript[]>(loadTranscripts)
  const [listening,    setListening]    = useState(false)
  const [interim,      setInterim]      = useState('')
  const [language,     setLanguage]     = useState<Language>('auto')
  const [engine,       setEngine]       = useState<Engine>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const recognitionRef      = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef    = useRef<MediaRecorder | null>(null)
  const chunksRef           = useRef<Blob[]>([])
  // Continuous Whisper mode (cloud)
  const streamRef           = useRef<MediaStream | null>(null)
  const continuousRef       = useRef(false)
  const audioCtxRef         = useRef<AudioContext | null>(null)
  const silenceTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkStartTimeRef   = useRef(0)
  const speechDetectedRef   = useRef(false)

  // Engine detection: cloud function → browser Speech API.
  useEffect(() => {
    async function detectEngine() {
      if (await checkCloudApi()) { setEngine('cloud');   return }
      setEngine('browser')
    }
    detectEngine()
  }, [])

  // Cleanup: stop all recording resources when the component unmounts.
  useEffect(() => {
    return () => {
      continuousRef.current = false
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      if (silenceIntervalRef.current !== null) {
        clearInterval(silenceIntervalRef.current)
        silenceIntervalRef.current = null
      }
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop() // onstop will release the stream
      } else {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      recognitionRef.current?.stop()
    }
  }, [])

  // Browser SpeechRecognition — only used when engine === 'browser'.
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous    = true
    recognition.interimResults = true
    const langMap: Record<Language, string> = { en: 'en-US', no: 'nb-NO', auto: 'en-US' }
    recognition.lang = langMap[language]

    recognition.onresult = (event) => {
      let interimText = ''
      let finalText   = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalText   += result[0].transcript
        else                interimText += result[0].transcript
      }
      setInterim(interimText)
      if (finalText.trim()) {
        const entry: Transcript = {
          id:        crypto.randomUUID(),
          text:      finalText.trim(),
          language,
          createdAt: new Date().toISOString(),
          source:    'browser',
        }
        setTranscripts((prev) => {
          const updated = [entry, ...prev]
          saveTranscripts(updated)
          return updated
        })
        setInterim('')
      }
    }

    recognition.onend   = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setError('Microphone error. Please try again.')
    }

    recognitionRef.current = recognition
  }, [language])

  // Continuous Whisper recording: records a chunk, sends it when the user pauses
  // (silence detected for SILENCE_DELAY_MS), then immediately starts the next chunk.
  // The microphone stream stays open the whole time — only the MediaRecorder cycles.
  const startCloudEngine = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
    if (!stream) {
      setError('Could not access microphone.')
      return
    }
    streamRef.current  = stream
    continuousRef.current = true

    const mimeType = bestSupportedMimeType()

    // --- Silence detection ---
    const audioCtx = new AudioContext()
    audioCtxRef.current = audioCtx
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    const freqData = new Uint8Array(analyser.frequencyBinCount)

    const SILENCE_THRESHOLD = 10   // avg amplitude below this = silence
    const SPEECH_THRESHOLD  = 20   // avg amplitude must reach this at least once per chunk
    const SILENCE_DELAY_MS  = 1500 // pause duration before auto-sending the chunk
    const WARMUP_MS         = 500  // ignore silence in the first 500 ms of each chunk

    silenceIntervalRef.current = setInterval(() => {
      if (!continuousRef.current) return
      // Give the recorder a moment to settle before watching for silence
      if (Date.now() - chunkStartTimeRef.current < WARMUP_MS) return

      analyser.getByteFrequencyData(freqData)
      const avg = freqData.reduce((s, v) => s + v, 0) / freqData.length

      // Mark speech as present the first time the level clears the speech threshold
      if (avg >= SPEECH_THRESHOLD) speechDetectedRef.current = true

      if (avg < SILENCE_THRESHOLD) {
        if (silenceTimerRef.current === null) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
          }, SILENCE_DELAY_MS)
        }
      } else {
        if (silenceTimerRef.current !== null) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      }
    }, 100)

    // --- Chunk recorder ---
    function startChunk() {
      if (!continuousRef.current || !streamRef.current) return
      const recorder = new MediaRecorder(streamRef.current!, mimeType ? { mimeType } : {})
      chunksRef.current = []
      chunkStartTimeRef.current = Date.now()
      speechDetectedRef.current = false

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const actualType = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: actualType })
        // Skip blobs with no detected speech (prevents Whisper hallucinations on noise)
        if (blob.size > 500 && speechDetectedRef.current) {
          setIsProcessing(true)
          setError(null)
          try {
            const text = await transcribeWithCloud(blob, language)
            if (text.trim()) {
              const entry: Transcript = {
                id:        crypto.randomUUID(),
                text:      text.trim(),
                language,
                createdAt: new Date().toISOString(),
                source:    'cloud',
              }
              setTranscripts((prev) => {
                const updated = [entry, ...prev]
                saveTranscripts(updated)
                return updated
              })
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Transcription failed.')
          } finally {
            setIsProcessing(false)
          }
        }
        // Continue loop or clean up
        if (continuousRef.current) {
          startChunk()
        } else {
          const s = streamRef.current
          streamRef.current = null
          s?.getTracks().forEach((t) => t.stop())
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
    }

    startChunk()
    setListening(true)
    setError(null)
  }, [language])

  const toggle = useCallback(() => {
    if (listening) {
      if (engine === 'cloud') {
        // Stop the continuous recording loop
        continuousRef.current = false
        if (silenceTimerRef.current !== null) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
        if (silenceIntervalRef.current !== null) {
          clearInterval(silenceIntervalRef.current)
          silenceIntervalRef.current = null
        }
        audioCtxRef.current?.close().catch(() => {})
        audioCtxRef.current = null

        if (mediaRecorderRef.current?.state === 'recording') {
          // onstop will clean up the stream once it finishes the last transcription
          mediaRecorderRef.current.stop()
        } else {
          // Recorder already stopped (processing in-flight) — clean up stream now
          const s = streamRef.current
          streamRef.current = null
          s?.getTracks().forEach((t) => t.stop())
        }
        setListening(false)
      } else {
        recognitionRef.current?.stop()
        setListening(false)
      }
    } else {
      if (engine === 'cloud') {
        startCloudEngine()
      } else {
        recognitionRef.current?.start()
        setListening(true)
        setError(null)
        setInterim('')
      }
    }
  }, [listening, engine, startCloudEngine])

  const deleteTranscript = useCallback((id: string) => {
    setTranscripts((prev) => {
      const updated = prev.filter((t) => t.id !== id)
      saveTranscripts(updated)
      return updated
    })
  }, [])

  const clearAll = useCallback(() => {
    setTranscripts([])
    saveTranscripts([])
  }, [])

  const browserSupported = !!(
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  )

  const canTranscribe = engine === 'cloud' || browserSupported

  return {
    transcripts,
    listening,
    interim,
    language,
    setLanguage,
    engine,
    isProcessing,
    error,
    browserSupported,
    canTranscribe,
    toggle,
    deleteTranscript,
    clearAll,
  }
}
