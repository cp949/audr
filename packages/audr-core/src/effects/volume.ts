export class VolumeEffect {
  readonly input: GainNode;
  readonly output: GainNode;

  constructor(
    audioContext: BaseAudioContext,
    volume: number,
    startSeconds: number,
    endSeconds: number,
  ) {
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();

    const gain = audioContext.createGain();

    // Smoothly ramp the gain up before the start time, and down after the end time.
    const rampLength = 0.01;
    gain.gain.setValueAtTime(1.0, Math.max(0, startSeconds - rampLength));
    gain.gain.exponentialRampToValueAtTime(volume, startSeconds);
    gain.gain.setValueAtTime(volume, endSeconds);
    gain.gain.exponentialRampToValueAtTime(1.0, endSeconds + rampLength);

    this.input.connect(gain);
    gain.connect(this.output);
  }
}
