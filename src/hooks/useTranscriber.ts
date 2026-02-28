import { useState, useRef, useEffect, useCallback } from 'react'

export interface Transcript {
  id: string
  text: string
  language: string
  createdAt: string
  source: 'lytt' | 'cloud' | 'browser'
}

export type Language = 'en' | 'no' | 'auto'

/** Which transcription engine is active. `null` = still detecting. */
export type Engine = 'lytt' | 'cloud' | 'browser' | null

const STORAGE_KEY = 'dyngeseth:transcripts'
const LYTT_BRIDGE = 'http://localhost:3000'
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

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

async function checkLyttBridge(): Promise<boolean> {
  try {
    const res = await fetch(`${LYTT_BRIDGE}/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
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

async function transcribeWithApi(
  url: string,
  blob: Blob,
  language: Language,
): Promise<string> {
  const ext      = mimeToExt(blob.type)
  const formData = new FormData()
  // Name the file with the correct extension so the server and OpenAI can
  // identify the container format from the filename when the MIME type alone
  // isn't enough (e.g. some proxies strip Content-Type from multipart parts).
  formData.append('file', blob, `recording.${ext}`)
  if (language !== 'auto') {
    formData.append('language', language === 'no' ? 'norwegian' : 'english')
  }
  const res = await fetch(url, { method: 'POST', body: formData })
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

  const recognitionRef   = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])

  // Tier detection: lytt-bridge (local) → cloud function → browser Speech API.
  useEffect(() => {
    async function detectEngine() {
      if (await checkLyttBridge()) { setEngine('lytt');    return }
      if (await checkCloudApi())   { setEngine('cloud');   return }
      setEngine('browser')
    }
    detectEngine()
  }, [])

  // Browser SpeechRecognition — only used when engine === 'browser'.
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous    = true
    recognition.interimResults = true

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

  useEffect(() => {
    if (!recognitionRef.current) return
    const langMap: Record<Language, string> = { en: 'en-US', no: 'nb-NO', auto: 'en-US' }
    recognitionRef.current.lang = langMap[language]
  }, [language])

  // Shared MediaRecorder logic used by both the lytt-bridge and cloud tiers.
  const startWhisperEngine = useCallback(
    async (apiUrl: string, source: 'lytt' | 'cloud') => {
      try {
        const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Pick the best codec the browser supports. Passing an empty string
        // lets the browser use its own default, which is also fine.
        const mimeType = bestSupportedMimeType()
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
        chunksRef.current = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop())
          setIsProcessing(true)
          setError(null)
          try {
            // Use recorder.mimeType — the browser may have refined it
            // (e.g. "audio/webm" → "audio/webm;codecs=opus").
            const actualType = recorder.mimeType || mimeType || 'audio/webm'
            const blob = new Blob(chunksRef.current, { type: actualType })
            const text = await transcribeWithApi(apiUrl, blob, language)
            if (text.trim()) {
              const entry: Transcript = {
                id:        crypto.randomUUID(),
                text:      text.trim(),
                language,
                createdAt: new Date().toISOString(),
                source,
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

        recorder.start()
        mediaRecorderRef.current = recorder
        setListening(true)
        setError(null)
      } catch {
        setError('Could not access microphone.')
      }
    },
    [language],
  )

  const toggle = useCallback(() => {
    if (listening) {
      if (engine === 'lytt' || engine === 'cloud') {
        mediaRecorderRef.current?.stop()
      } else {
        recognitionRef.current?.stop()
      }
      setListening(false)
    } else {
      if (engine === 'lytt') {
        startWhisperEngine(`${LYTT_BRIDGE}/transcribe`, 'lytt')
      } else if (engine === 'cloud') {
        startWhisperEngine(CLOUD_API, 'cloud')
      } else {
        recognitionRef.current?.start()
        setListening(true)
        setError(null)
        setInterim('')
      }
    }
  }, [listening, engine, startWhisperEngine])

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

  const canTranscribe = engine === 'lytt' || engine === 'cloud' || browserSupported

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
