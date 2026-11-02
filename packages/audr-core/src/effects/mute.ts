export class MuteEffect {
  readonly input: GainNode;
  readonly output: GainNode;

  constructor(audioContext: BaseAudioContext, startSeconds: number, endSeconds: number) {
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();

    const gain = audioContext.createGain();

    // Smoothly ramp the gain down before the start time, and up after the end time.
    const rampLength = 0.001;
    gain.gain.setValueAtTime(1.0, Math.max(0, startSeconds - rampLength));
    gain.gain.linearRampToValueAtTime(0, startSeconds);
    gain.gain.setValueAtTime(0, endSeconds);
    gain.gain.linearRampToValueAtTime(1.0, endSeconds + rampLength);

    this.input.connect(gain);
    gain.connect(this.output);
  }
}
