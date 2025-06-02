// AudioWorklet processor for continuous voice capture with smart processing
class ContinuousVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
    this.isActive = false
    this.isMuted = false
    this.isAISpeaking = false
    
    this.port.onmessage = (event) => {
      const { type, active, muted, aiSpeaking } = event.data
      
      switch (type) {
        case 'setActive':
          this.isActive = active
          break
        case 'setMuted':
          this.isMuted = muted
          break
        case 'setAISpeaking':
          this.isAISpeaking = aiSpeaking
          break
        case 'reset':
          this.bufferIndex = 0
          break
      }
    }
  }
  
  process(inputs, outputs) {
    const input = inputs[0]
    
    // Only process if conditions are met
    const shouldProcess = this.isActive && !this.isMuted && !this.isAISpeaking
    
    if (input.length > 0 && shouldProcess) {
      const inputChannel = input[0]
      
      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex] = inputChannel[i]
        this.bufferIndex++
        
        if (this.bufferIndex >= this.bufferSize) {
          // Send buffer to main thread
          this.port.postMessage({
            type: 'audioData',
            buffer: this.buffer.slice() // Copy the buffer
          })
          
          // Reset buffer
          this.bufferIndex = 0
        }
      }
    } else if (!shouldProcess && this.bufferIndex > 0) {
      // Clear buffer when not processing to prevent memory buildup
      this.bufferIndex = 0
    }
    
    return true // Keep processor alive
  }
}

registerProcessor('continuous-voice-processor', ContinuousVoiceProcessor)
