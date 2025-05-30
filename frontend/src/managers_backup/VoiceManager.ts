// voice/VoiceManager.ts - Simplified voice capture management
export type VoiceMode = 'push-to-talk' | 'continuous'
export type RecordingState = 'idle' | 'recording' | 'processing'

interface VoiceCallbacks {
  onStateChange: (state: RecordingState) => void
  onAudioData: (audioBase64: string) => void
  onError: (error: string) => void
}

class VoiceManager {
  private static instance: VoiceManager | null = null
  private mediaRecorder: MediaRecorder | null = null
  private audioStream: MediaStream | null = null
  private recordingState: RecordingState = 'idle'
  private callbacks: VoiceCallbacks | null = null
  private audioChunks: Blob[] = []
  private isInitialized = false
  private permissionGranted = false

  private constructor() {}

  static getInstance(): VoiceManager {
    if (!VoiceManager.instance) {
      VoiceManager.instance = new VoiceManager()
    }
    return VoiceManager.instance
  }

  setCallbacks(callbacks: VoiceCallbacks) {
    this.callbacks = callbacks
  }

  private setState(state: RecordingState) {
    if (this.recordingState !== state) {
      this.recordingState = state
      console.log(`🎤 Recording state: ${state}`)
      this.callbacks?.onStateChange(state)
    }
  }

  // Initialize microphone access
  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.permissionGranted) {
      return true
    }

    try {
      console.log('🎤 Requesting microphone permission...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })

      this.audioStream = stream
      this.permissionGranted = true
      this.isInitialized = true
      
      console.log('✅ Microphone access granted')
      return true

    } catch (error) {
      console.error('❌ Microphone permission denied:', error)
      this.callbacks?.onError('Microphone permission required')
      return false
    }
  }

  // Start recording
  async startRecording(): Promise<boolean> {
    if (this.recordingState === 'recording') {
      console.warn('Already recording')
      return true
    }

    if (!await this.initialize()) {
      return false
    }

    try {
      this.audioChunks = []
      
      // Create MediaRecorder with proper settings for OpenAI
      this.mediaRecorder = new MediaRecorder(this.audioStream!, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = () => {
        this.processRecording()
      }

      this.mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event)
        this.callbacks?.onError('Recording failed')
        this.setState('idle')
      }

      this.mediaRecorder.start(100) // Collect data every 100ms
      this.setState('recording')
      
      console.log('🎤 Recording started')
      return true

    } catch (error) {
      console.error('❌ Failed to start recording:', error)
      this.callbacks?.onError('Failed to start recording')
      return false
    }
  }

  // Stop recording
  stopRecording() {
    if (this.recordingState !== 'recording' || !this.mediaRecorder) {
      console.warn('Not currently recording')
      return
    }

    try {
      this.mediaRecorder.stop()
      this.setState('processing')
      console.log('🎤 Recording stopped')
    } catch (error) {
      console.error('❌ Failed to stop recording:', error)
      this.setState('idle')
    }
  }

  // Process recorded audio and convert to format expected by OpenAI
  private async processRecording() {
    try {
      if (this.audioChunks.length === 0) {
        console.warn('No audio data recorded')
        this.callbacks?.onError('No audio recorded')
        this.setState('idle')
        return
      }

      // Combine audio chunks
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' })
      
      // Check minimum size
      if (audioBlob.size < 1000) {
        console.warn('Audio too short')
        this.callbacks?.onError('Please speak longer')
        this.setState('idle')
        return
      }

      // Convert to PCM16 format for OpenAI
      const audioBase64 = await this.convertToPCM16(audioBlob)
      
      if (audioBase64) {
        console.log(`🎤 Audio processed: ${audioBase64.length} chars`)
        this.callbacks?.onAudioData(audioBase64)
      } else {
        this.callbacks?.onError('Audio processing failed')
      }

    } catch (error) {
      console.error('❌ Audio processing failed:', error)
      this.callbacks?.onError('Audio processing failed')
    } finally {
      this.setState('idle')
      this.audioChunks = []
    }
  }

  // Convert audio blob to PCM16 base64 format
  private async convertToPCM16(audioBlob: Blob): Promise<string | null> {
    try {
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer()
      
      // Create audio context for decoding
      const audioContext = new AudioContext({ sampleRate: 24000 })
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      
      // Get mono channel data
      const channelData = audioBuffer.getChannelData(0)
      
      // Convert to 16-bit PCM
      const pcm16 = new Int16Array(channelData.length)
      for (let i = 0; i < channelData.length; i++) {
        // Clamp to [-1, 1] and convert to 16-bit integer
        const sample = Math.max(-1, Math.min(1, channelData[i]))
        pcm16[i] = Math.floor(sample * 0x7FFF)
      }
      
      // Convert to base64
      const uint8Array = new Uint8Array(pcm16.buffer)
      let binaryString = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i])
      }
      
      await audioContext.close()
      return btoa(binaryString)

    } catch (error) {
      console.error('❌ PCM conversion failed:', error)
      return null
    }
  }

  // Cleanup
  cleanup() {
    console.log('🧹 Cleaning up VoiceManager')
    
    if (this.mediaRecorder && this.recordingState === 'recording') {
      this.mediaRecorder.stop()
    }
    
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop())
      this.audioStream = null
    }
    
    this.mediaRecorder = null
    this.audioChunks = []
    this.setState('idle')
    this.isInitialized = false
    this.permissionGranted = false
  }

  // Getters
  getState(): RecordingState {
    return this.recordingState
  }

  isRecording(): boolean {
    return this.recordingState === 'recording'
  }

  hasPermission(): boolean {
    return this.permissionGranted
  }
}

export default VoiceManager