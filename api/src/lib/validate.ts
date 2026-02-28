export const MAX_BYTES = 25 * 1024 * 1024 // 25 MB — OpenAI Whisper hard limit

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function validateAudioSize(bytes: number): void {
  if (bytes === 0) {
    throw new ValidationError('Audio file is empty.')
  }
  if (bytes > MAX_BYTES) {
    throw new ValidationError(
      `File too large (${(bytes / 1_048_576).toFixed(1)} MB). Maximum is 25 MB.`,
    )
  }
}
