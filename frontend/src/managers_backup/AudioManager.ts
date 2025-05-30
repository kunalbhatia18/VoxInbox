// audio/AudioManager.ts - Centralized singleton audio management
class AudioManager {
  private static instance: AudioManager | null = null
  private audioContext: AudioContext | null = null
  private isInitialized = false
  private initializationPromise: Promise<void> | null = null
  
  // Audio playback state
  private audioQueue: AudioBuffer[] = []
  private isPlaying = false
  private currentSource: AudioBufferSourceNode | null = null
  private nextPlayTime = 0
  private onPlaybackStart?: () => void
  private onPlaybackEnd?: () => void
  private onError?: (error: string) => void
  
  private constructor() {}
  
  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager()
    }
    return AudioManager.instance
  }
  
  // Initialize audio context once and reuse
  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.audioContext?.state === 'running') {
      return true
    }
    
    if (this.initializationPromise) {
      await this.initializationPromise
      return this.isInitialized
    }
    
    this.initializationPromise = this._doInitialize()
    await this.initializationPromise
    return this.isInitialized
  }
  
  private async _doInitialize(): Promise<void> {
    try {
      console.log('🔊 Initializing AudioManager...')
      
      // Close existing context if any
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close()
      }
      
      // Create new context with browser defaults
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) {
        throw new Error('Web Audio API not supported')
      }
      
      this.audioContext = new AudioContextClass({
        latencyHint: 'interactive'
      })
      
      // Resume if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }
      
      console.log(`✅ AudioContext initialized: ${this.audioContext.sampleRate}Hz, state: ${this.audioContext.state}`)
      this.isInitialized = true
      
    } catch (error) {
      console.error('❌ Failed to initialize AudioManager:', error)
      this.isInitialized = false
      throw error
    } finally {
      this.initializationPromise = null
    }
  }
  
  // Set event callbacks
  setCallbacks(callbacks: {
    onPlaybackStart?: () => void
    onPlaybackEnd?: () => void  
    onError?: (error: string) => void
  }) {
    this.onPlaybackStart = callbacks.onPlaybackStart
    this.onPlaybackEnd = callbacks.onPlaybackEnd
    this.onError = callbacks.onError
  }
  
  // Convert OpenAI PCM16 to AudioBuffer with proper resampling
  async convertPCMToAudioBuffer(base64Audio: string): Promise<AudioBuffer | null> {
    if (!this.audioContext) {
      console.error('AudioContext not initialized')
      return null
    }
    
    try {
      // Decode base64
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Convert to 16-bit samples  
      const int16Samples = new Int16Array(bytes.buffer)
      
      // OpenAI uses 24kHz, browser context might use 48kHz
      const openAISampleRate = 24000
      const contextSampleRate = this.audioContext.sampleRate
      const needsResampling = openAISampleRate !== contextSampleRate
      
      let finalSamples: Float32Array
      
      if (needsResampling) {
        // Resample to match context sample rate
        const ratio = contextSampleRate / openAISampleRate
        const outputLength = Math.ceil(int16Samples.length * ratio)
        finalSamples = new Float32Array(outputLength)
        
        for (let i = 0; i < outputLength; i++) {
          const srcIndex = i / ratio
          const index = Math.floor(srcIndex)
          const fraction = srcIndex - index
          
          const sample1 = int16Samples[index] || 0
          const sample2 = int16Samples[index + 1] || sample1
          
          const interpolated = sample1 + (sample2 - sample1) * fraction
          finalSamples[i] = interpolated / 32768.0 // Convert to float [-1, 1]
        }
        
        console.log(`🔄 Resampled ${int16Samples.length} samples (${openAISampleRate}Hz) → ${outputLength} samples (${contextSampleRate}Hz)`)
      } else {
        // No resampling needed
        finalSamples = new Float32Array(int16Samples.length)
        for (let i = 0; i < int16Samples.length; i++) {
          finalSamples[i] = int16Samples[i] / 32768.0
        }
      }
      
      // Create AudioBuffer
      const audioBuffer = this.audioContext.createBuffer(
        1, // Mono
        finalSamples.length,
        contextSampleRate
      )
      
      // Copy data
      audioBuffer.getChannelData(0).set(finalSamples)
      
      // Debug info
      const maxAmplitude = Math.max(...finalSamples.map(Math.abs))
      console.log(`🔊 Audio buffer: ${audioBuffer.duration.toFixed(2)}s, max: ${maxAmplitude.toFixed(3)}`)
      
      if (maxAmplitude < 0.001) {
        console.warn('⚠️ Very quiet audio detected')
      }
      
      return audioBuffer
      
    } catch (error) {
      console.error('❌ PCM conversion failed:', error)
      this.onError?.('Audio processing failed')
      return null
    }
  }
  
  // Add audio chunk to queue
  async addAudioChunk(base64Audio: string): Promise<void> {
    if (!await this.initialize()) {
      console.error('Failed to initialize audio for playback')
      return
    }
    
    const buffer = await this.convertPCMToAudioBuffer(base64Audio)
    if (buffer) {
      this.audioQueue.push(buffer)
      if (!this.isPlaying) {
        this.startPlayback()
      }
    }
  }
  
  // Start audio playback
  private startPlayback(): void {
    if (!this.audioContext || this.audioQueue.length === 0) return
    
    this.isPlaying = true
    this.nextPlayTime = Math.max(this.audioContext.currentTime, this.nextPlayTime)
    
    if (this.onPlaybackStart) {
      this.onPlaybackStart()
    }
    
    this.playNextBuffer()
  }
  
  // Play next buffer in queue
  private playNextBuffer(): void {
    if (!this.audioContext || this.audioQueue.length === 0) {
      // End of playback
      this.isPlaying = false
      if (this.onPlaybackEnd) {
        this.onPlaybackEnd()
      }
      return
    }
    
    const buffer = this.audioQueue.shift()!
    
    try {
      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(this.audioContext.destination)
      
      const startTime = this.nextPlayTime
      this.nextPlayTime += buffer.duration
      
      source.onended = () => {
        this.currentSource = null
        this.playNextBuffer()
      }
      
      this.currentSource = source
      source.start(startTime)
      
      console.log(`🎵 Playing: ${buffer.duration.toFixed(2)}s at ${startTime.toFixed(2)}s`)
      
    } catch (error) {
      console.error('❌ Playback error:', error)
      this.onError?.('Playback failed')
      this.playNextBuffer() // Continue with next buffer
    }
  }
  
  // Stop all playback
  stopPlayback(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch (e) {
        // Ignore if already stopped
      }
      this.currentSource = null
    }
    
    this.audioQueue = []
    this.isPlaying = false
    this.nextPlayTime = 0
  }
  
  // Test audio output
  async testAudio(): Promise<boolean> {
    if (!await this.initialize()) {
      return false
    }
    
    try {
      const duration = 0.3
      const frequency = 440
      const sampleRate = this.audioContext!.sampleRate
      
      const buffer = this.audioContext!.createBuffer(1, sampleRate * duration, sampleRate)
      const data = buffer.getChannelData(0)
      
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.1
      }
      
      const source = this.audioContext!.createBufferSource()
      source.buffer = buffer
      source.connect(this.audioContext!.destination)
      source.start()
      
      console.log('🎵 Test tone played')
      return true
      
    } catch (error) {
      console.error('❌ Test audio failed:', error)
      return false
    }
  }
  
  // Cleanup
  async cleanup(): Promise<void> {
    this.stopPlayback()
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close()
    }
    
    this.audioContext = null
    this.isInitialized = false
    this.initializationPromise = null
    
    console.log('🧹 AudioManager cleaned up')
  }
  
  // Get current state
  getState() {
    return {
      isInitialized: this.isInitialized,
      isPlaying: this.isPlaying,
      queueLength: this.audioQueue.length,
      contextState: this.audioContext?.state || 'none',
      sampleRate: this.audioContext?.sampleRate || 0
    }
  }
}

export default AudioManager