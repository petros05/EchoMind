class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // ~93ms at 44.1kHz, well within 50-1000ms range
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // Only process if we have input data
    if (input.length > 0) {
      const inputData = input[0];
      
      // Fill the buffer
      for (let i = 0; i < inputData.length; i++) {
        this.buffer[this.bufferIndex] = inputData[i];
        this.bufferIndex++;
        
        // When buffer is full, send it and reset
        if (this.bufferIndex >= this.bufferSize) {
          this.port.postMessage(this.buffer.slice()); // Send a copy of the buffer
          this.bufferIndex = 0; // Reset buffer
        }
      }
    }
    
    // Keep the processor alive
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
