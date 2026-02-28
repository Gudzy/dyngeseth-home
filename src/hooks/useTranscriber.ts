import { useState, useRef, useEffect, useCallback } from 'react'

export interface Transcript {
  id: string
  text: string
  language: string
  createdAt: string
  source: 'lytt' | 'browser'
}

export type Language = 'en' | 'no' | 'auto'

const STORAGE_KEY = 'dyngeseth:transcripts'
const LYTT_API = 'http://localhost:3000'

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

async function checkLyttAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${LYTT_API}/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function transcribeWithLytt(blob: Blob, language: Language): Promise<string> {
  const formData = new FormData()
  formData.append('file', blob, 'recording.webm')
  if (language !== 'auto') {
    formData.append('language', language === 'no' ? 'norwegian' : 'english')
  }
  const res = await fetch(`${LYTT_API}/transcribe`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Lytt transcription failed')
  const data = await res.json() as { text: string }
  return data.text
}

export function useTranscriber() {
  const [transcripts, setTranscripts] = useState<Transcript[]>(loadTranscripts)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [language, setLanguage] = useState<Language>('auto')
  const [lyttAvailable, setLyttAvailable] = useState<boolean | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    checkLyttAvailable().then(setLyttAvailable)
  }, [])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let interimText = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalText += result[0].transcript
        else interimText += result[0].transcript
      }
      setInterim(interimText)
      if (finalText.trim()) {
        const entry: Transcript = {
          id: crypto.randomUUID(),
          text: finalText.trim(),
          language,
          createdAt: new Date().toISOString(),
          source: 'browser',
        }
        setTranscripts((prev) => {
          const updated = [entry, ...prev]
          saveTranscripts(updated)
          return updated
        })
        setInterim('')
      }
    }

    recognition.onend = () => setListening(false)
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

  const startLytt = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setIsProcessing(true)
        setError(null)
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const text = await transcribeWithLytt(blob, language)
          if (text.trim()) {
            const entry: Transcript = {
              id: crypto.randomUUID(),
              text: text.trim(),
              language,
              createdAt: new Date().toISOString(),
              source: 'lytt',
            }
            setTranscripts((prev) => {
              const updated = [entry, ...prev]
              saveTranscripts(updated)
              return updated
            })
          }
        } catch {
          setError('Lytt transcription failed. Is `lytt serve` running?')
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
  }, [language])

  const toggle = useCallback(() => {
    if (listening) {
      if (lyttAvailable) {
        mediaRecorderRef.current?.stop()
      } else {
        recognitionRef.current?.stop()
      }
      setListening(false)
    } else {
      if (lyttAvailable) {
        startLytt()
      } else {
        recognitionRef.current?.start()
        setListening(true)
        setError(null)
        setInterim('')
      }
    }
  }, [listening, lyttAvailable, startLytt])

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

  return {
    transcripts,
    listening,
    interim,
    language,
    setLanguage,
    lyttAvailable,
    isProcessing,
    error,
    browserSupported,
    toggle,
    deleteTranscript,
    clearAll,
  }
}
