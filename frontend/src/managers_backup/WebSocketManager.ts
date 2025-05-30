// websocket/WebSocketManager.ts - Clean WebSocket management
import AudioManager from './AudioManager'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'
export type VoiceState = 'idle' | 'listening' | 'speaking'

interface WebSocketCallbacks {
  onConnectionChange: (state: ConnectionState) => void
  onVoiceStateChange: (state: VoiceState) => void
  onMessage: (message: string) => void
  onError: (error: string) => void
}

class WebSocketManager {
  private static instance: WebSocketManager | null = null
  private ws: WebSocket | null = null
  private connectionState: ConnectionState = 'disconnected'
  private voiceState: VoiceState = 'idle'
  private callbacks: WebSocketCallbacks | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private reconnectTimeout: NodeJS.Timeout | null = null
  private sessionId: string | null = null
  private audioManager: AudioManager
  private isDestroyed = false
  private audioReceived = false
  private audioTimeoutRef: NodeJS.Timeout | null = null

  private constructor() {
    this.audioManager = AudioManager.getInstance()
    this.setupAudioCallbacks()
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager()
    }
    return WebSocketManager.instance
  }

  private setupAudioCallbacks() {
    this.audioManager.setCallbacks({
      onPlaybackStart: () => {
        this.setVoiceState('speaking')
      },
      onPlaybackEnd: () => {
        this.setVoiceState('idle')
      },
      onError: (error) => {
        this.callbacks?.onError(`Audio: ${error}`)
      }
    })
  }

  setCallbacks(callbacks: WebSocketCallbacks) {
    this.callbacks = callbacks
  }

  private setConnectionState(state: ConnectionState) {
    if (this.connectionState !== state) {
      this.connectionState = state
      console.log(`🔌 Connection state: ${state}`)
      this.callbacks?.onConnectionChange(state)
    }
  }

  private setVoiceState(state: VoiceState) {
    if (this.voiceState !== state) {
      this.voiceState = state
      console.log(`🎤 Voice state: ${state}`)
      this.callbacks?.onVoiceStateChange(state)
    }
  }

  async connect(sessionId: string): Promise<boolean> {
    if (this.isDestroyed) {
      console.warn('WebSocketManager is destroyed, cannot connect')
      return false
    }

    // Clean up existing connection
    if (this.ws) {
      this.disconnect()
    }

    this.sessionId = sessionId
    this.setConnectionState('connecting')

    try {
      console.log(`🔌 Connecting to WebSocket with session: ${sessionId}`)
      
      this.ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`)
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected')
        this.setConnectionState('connected')
        this.reconnectAttempts = 0
        
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout)
          this.reconnectTimeout = null
        }
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket closed: ${event.code} - ${event.reason}`)
        
        if (this.ws === event.target) {
          this.ws = null
          this.setConnectionState('disconnected')
          this.setVoiceState('idle')
          
          // Auto-reconnect on unexpected closure
          if (event.code !== 1000 && event.code !== 1001 && !this.isDestroyed) {
            this.attemptReconnect()
          }
        }
      }

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        this.setConnectionState('error')
        this.callbacks?.onError('Connection failed')
      }

      return true

    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error)
      this.setConnectionState('error')
      this.callbacks?.onError(`Connection failed: ${error}`)
      return false
    }
  }

  private handleMessage(data: string) {
    try {
      const message = JSON.parse(data)
      const type = message.type

      // Handle audio responses
      if (type === 'response.audio.delta' && message.delta) {
        this.audioManager.addAudioChunk(message.delta)
        this.audioReceived = true  // Track that we got audio
      } 
      else if (type === 'response.created') {
        console.log('🤖 OpenAI response started')
        // Clear any existing audio
        this.audioManager.stopPlayback()
        this.audioReceived = false  // Reset audio tracking
        
        // Set timeout to detect text-only responses
        if (this.audioTimeoutRef) {
          clearTimeout(this.audioTimeoutRef)
        }
        this.audioTimeoutRef = setTimeout(() => {
          if (!this.audioReceived) {
            console.warn('⚠️ No audio received from OpenAI - got text-only response')
            this.callbacks?.onError('OpenAI returned text instead of audio. Please try again.')
            this.setVoiceState('idle')
          }
        }, 3000)  // 3 second timeout
      }
      else if (type === 'response.audio.done') {
        console.log('🎧 Audio response complete')
        if (this.audioTimeoutRef) {
          clearTimeout(this.audioTimeoutRef)
          this.audioTimeoutRef = null
        }
        // Audio manager will handle state changes via callbacks
      }
      else if (type === 'response.done') {
        console.log('✅ OpenAI response complete')
        if (message.response?.status) {
          console.log('Response status:', message.response.status)
        }
        
        // Check if we got a completed response without audio
        if (message.response?.status === 'completed' && !this.audioReceived) {
          console.warn('⚠️ OpenAI completed response without audio')
          this.callbacks?.onError('No audio response received. Please try speaking again.')
          this.setVoiceState('idle')
        }
        
        // Clear timeout
        if (this.audioTimeoutRef) {
          clearTimeout(this.audioTimeoutRef)
          this.audioTimeoutRef = null
        }
      }
      else if (type === 'system') {
        this.callbacks?.onMessage(message.message || 'System message')
      }
      else if (type === 'error') {
        console.error('❌ OpenAI Error:', message.error)
        this.callbacks?.onError(`OpenAI: ${message.error?.message || 'Unknown error'}`)
        this.setVoiceState('idle')
      }

    } catch (error) {
      console.error('❌ Failed to parse WebSocket message:', error)
    }
  }

  private attemptReconnect() {
    if (this.isDestroyed || !this.sessionId) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached')
      this.setConnectionState('error')
      this.callbacks?.onError('Connection lost - please refresh')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000)
    
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.sessionId!)
    }, delay)
  }

  // Send audio data to OpenAI
  sendAudio(audioBase64: string): boolean {
    if (!this.isConnected()) {
      console.warn('Cannot send audio - not connected')
      return false
    }

    try {
      // Send audio data
      this.ws!.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: audioBase64
      }))

      // Commit the audio buffer
      this.ws!.send(JSON.stringify({
        type: "input_audio_buffer.commit"
      }))

      // Request response with audio - FORCE audio-only mode
      this.ws!.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],  // ONLY audio - no text option
          instructions: "You are VoiceInbox, a helpful Gmail assistant. You MUST always respond with spoken audio - never text only. Always speak your response out loud. Be concise but always provide an audible response.",
          voice: "alloy",
          output_audio_format: "pcm16",
          temperature: 0.7,
          max_output_tokens: 200  // Increased for better audio responses
        }
      }))

      console.log(`🎤 Sent audio to OpenAI (${audioBase64.length} chars)`)
      return true

    } catch (error) {
      console.error('❌ Failed to send audio:', error)
      this.callbacks?.onError('Failed to send voice command')
      return false
    }
  }

  disconnect() {
    console.log('🔌 Disconnecting WebSocket')
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close(1000, 'User disconnected')
      this.ws = null
    }

    this.audioManager.stopPlayback()
    this.setConnectionState('disconnected')
    this.setVoiceState('idle')
    this.reconnectAttempts = 0
  }

  destroy() {
    console.log('🗑️ Destroying WebSocketManager')
    this.isDestroyed = true
    this.disconnect()
    this.callbacks = null
    this.sessionId = null
  }

  // Getters
  isConnected(): boolean {
    return this.connectionState === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  getVoiceState(): VoiceState {
    return this.voiceState
  }

  // Test audio functionality
  async testAudio(): Promise<boolean> {
    return await this.audioManager.testAudio()
  }
}

export default WebSocketManager