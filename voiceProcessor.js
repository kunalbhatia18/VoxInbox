// Audio Worklet Processor for voice capture
// This runs in a separate audio thread for better performance

class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = []
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    
    if (input && input[0]) {
      // Copy input data to buffer
      const inputData = input[0]
      
      // Add to buffer
      this.buffer.push(...inputData)
      
      // When buffer is full, send to main thread
      if (this.buffer.length >= this.bufferSize) {
        this.port.postMessage({
          type: 'audio',
          buffer: new Float32Array(this.buffer.slice(0, this.bufferSize))
        })
        
        // Keep remaining samples
        this.buffer = this.buffer.slice(this.bufferSize)
      }
    }
    
    // Continue processing
    return true
  }
}

registerProcessor('voice-processor', VoiceProcessor)
