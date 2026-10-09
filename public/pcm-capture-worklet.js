// AudioWorklet: downsample microphone audio to 16 kHz mono 16-bit PCM and post 40 ms chunks.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000; // `sampleRate` is the AudioContext rate (global in worklet scope)
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.idx = 0;
    this.out = new Int16Array(640); // 640 samples @16 kHz = 40 ms
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i];
      this.count++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        let v = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
        if (v > 1) v = 1;
        else if (v < -1) v = -1;
        this.out[this.idx++] = v < 0 ? v * 32768 : v * 32767;
        if (this.idx === this.out.length) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(640);
          this.idx = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
