export class FadeEffect {
  readonly input: GainNode;
  readonly output: GainNode;

  constructor(
    audioContext: BaseAudioContext,
    fadeIn: boolean,
    startSeconds: number,
    endSeconds: number,
  ) {
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();

    const gain = audioContext.createGain();

    gain.gain.setValueAtTime(1, 0);

    if (fadeIn) {
      gain.gain.setValueAtTime(0, startSeconds);
      gain.gain.linearRampToValueAtTime(1, endSeconds);
    } else {
      gain.gain.setValueAtTime(1, startSeconds);
      gain.gain.linearRampToValueAtTime(0, endSeconds);
    }

    gain.gain.setValueAtTime(1, endSeconds);

    this.input.connect(gain);
    gain.connect(this.output);
  }
}
