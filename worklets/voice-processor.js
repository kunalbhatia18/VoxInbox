// AudioWorklet processor for voice capture
class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
    this.isActive = true
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'setActive') {
        this.isActive = event.data.active
      }
    }
  }
  
  process(inputs, outputs) {
    const input = inputs[0]
    
    if (input.length > 0 && this.isActive) {
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
    }
    
    return true // Keep processor alive
  }
}

registerProcessor('voice-processor', VoiceProcessor)
