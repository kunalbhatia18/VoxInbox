// 🚀 OPTIMIZED voice-processor.js - Ultra Low Latency Version

class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isActive = false
    this.bufferSize = 128 // 🚀 ULTRA LOW LATENCY: Smallest possible buffer
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
    
    // 🚀 VOICE ACTIVITY DETECTION
    this.silenceThreshold = 0.008 // Sensitive voice detection
    this.silenceCount = 0
    this.maxSilenceFrames = 8 // Very responsive silence detection
    this.voiceDetected = false
    
    // 🚀 PERFORMANCE OPTIMIZATION
    this.frameCount = 0
    this.processEveryNFrames = 1 // Process every frame for ultra-low latency
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'setActive') {
        this.isActive = event.data.active
        if (this.isActive) {
          console.log('🚀 AudioWorklet activated - ultra low latency mode')
          this.resetState()
        }
      }
    }
  }
  
  resetState() {
    this.bufferIndex = 0
    this.silenceCount = 0
    this.voiceDetected = false
    this.frameCount = 0
  }
  
  // 🚀 OPTIMIZED: Fast voice activity detection
  detectVoice(samples) {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += Math.abs(samples[i])
    }
    const average = sum / samples.length
    return average > this.silenceThreshold
  }
  
  process(inputs, outputs, parameters) {
    if (!this.isActive || inputs.length === 0 || inputs[0].length === 0) {
      return true
    }
    
    const input = inputs[0][0] // First channel
    if (!input) return true
    
    this.frameCount++
    
    // 🚀 ULTRA RESPONSIVE: Process every frame
    if (this.frameCount % this.processEveryNFrames === 0) {
      // Copy input to buffer
      for (let i = 0; i < input.length; i++) {
        if (this.bufferIndex < this.bufferSize) {
          this.buffer[this.bufferIndex++] = input[i]
        }
        
        // 🚀 IMMEDIATE PROCESSING: Send as soon as buffer is full
        if (this.bufferIndex >= this.bufferSize) {
          this.processBuffer()
        }
      }
    }
    
    return true
  }
  
  processBuffer() {
    if (this.bufferIndex === 0) return
    
    // Create a copy of the current buffer
    const audioData = new Float32Array(this.bufferIndex)
    audioData.set(this.buffer.subarray(0, this.bufferIndex))
    
    // 🚀 VOICE ACTIVITY DETECTION
    const hasVoice = this.detectVoice(audioData)
    
    if (hasVoice) {
      this.voiceDetected = true
      this.silenceCount = 0
      
      // 🚀 IMMEDIATE SEND: Send audio immediately when voice detected
      this.port.postMessage({
        type: 'audioData',
        buffer: audioData,
        hasVoice: true,
        timestamp: currentTime
      })
    } else if (this.voiceDetected) {
      // We were speaking, now silence
      this.silenceCount++
      
      // Still send the silence for context
      this.port.postMessage({
        type: 'audioData',
        buffer: audioData,
        hasVoice: false,
        silenceCount: this.silenceCount,
        timestamp: currentTime
      })
      
      // 🚀 AUTO-STOP: Signal to stop recording after silence
      if (this.silenceCount >= this.maxSilenceFrames) {
        this.port.postMessage({
          type: 'silenceDetected',
          silenceCount: this.silenceCount
        })
        this.resetState()
      }
    }
    // If no voice has been detected yet, don't send anything (save bandwidth)
    
    // Reset buffer
    this.bufferIndex = 0
  }
}

registerProcessor('voice-processor', VoiceProcessor)
