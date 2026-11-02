export class EchoEffect {
  static get DELAY_TIME(): number {
    return 0.25;
  }
  static get TAIL_SECONDS(): number {
    return 0.75;
  }

  readonly input: GainNode;
  readonly output: GainNode;

  constructor(audioContext: BaseAudioContext, startTime: number, endTime: number) {
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();

    const effectInput = audioContext.createGain();
    effectInput.gain.value = 0;

    effectInput.gain.setValueAtTime(0.75, startTime);
    effectInput.gain.setValueAtTime(0, endTime);

    const delay = audioContext.createDelay(1);
    delay.delayTime.value = EchoEffect.DELAY_TIME;
    const decay = audioContext.createGain();
    decay.gain.value = 0.3;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -5;
    compressor.knee.value = 15;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    this.input.connect(effectInput);
    effectInput.connect(delay);
    delay.connect(compressor);
    this.input.connect(compressor);
    delay.connect(decay);
    decay.connect(delay);
    compressor.connect(this.output);
  }
}
