import { renderGraph } from "./graph";
import { segmentEffect } from "./segment";

export class RobotEffect {
  readonly input: GainNode;
  readonly output: GainNode;

  constructor(audioContext: BaseAudioContext, startTime: number, endTime: number) {
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    const passthrough = audioContext.createGain();
    const effectInput = audioContext.createGain();

    passthrough.gain.value = 1;
    effectInput.gain.value = 0;

    passthrough.gain.setValueAtTime(0, startTime);
    passthrough.gain.setValueAtTime(1, endTime);

    effectInput.gain.setValueAtTime(1, startTime);
    effectInput.gain.setValueAtTime(0, endTime);

    // Ring modulator inspired by BBC Dalek voice
    // http://recherche.ircam.fr/pub/dafx11/Papers/66_e.pdf
    // https://github.com/bbc/webaudio.prototyping.bbc.co.uk

    // > There are four parallel signal paths, two which process the
    // > combination Vc + Vin / 2 and two which process Vc - Vin/2.
    // > Each branch consists of a non-linearity [diode]...
    const createDiodeNode = () => {
      const node = audioContext.createWaveShaper();

      // Piecewise function given by (2) in Parker paper
      const transform = (v: number, vb = 0.2, vl = 0.4, h = 0.65) => {
        if (v <= vb) return 0;
        if (v <= vl) return h * (Math.pow(v - vb, 2) / (2 * vl - 2 * vb));
        return h * v - h * vl + h * (Math.pow(v - vb, 2) / (2 * vl - 2 * vb));
      };

      // Create the waveshaper curve with the voltage transform above
      const bufferLength = 1024;
      const curve = new Float32Array(bufferLength);
      for (let i = 0; i < bufferLength; i++) {
        const voltage = 2 * (i / bufferLength) - 1;
        curve[i] = transform(voltage);
      }
      node.curve = curve;
      return node;
    };

    const oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 50;
    oscillator.start(0);

    const vInGain = audioContext.createGain();
    vInGain.gain.value = 0.5;

    const vInInverter1 = audioContext.createGain();
    vInInverter1.gain.value = -1;

    const vInInverter2 = audioContext.createGain();
    vInInverter2.gain.value = -1;

    const vInDiode1 = createDiodeNode();
    const vInDiode2 = createDiodeNode();

    const vInInverter3 = audioContext.createGain();
    vInInverter3.gain.value = -1;

    const vcInverter1 = audioContext.createGain();
    vcInverter1.gain.value = -1;

    const vcDiode3 = createDiodeNode();
    const vcDiode4 = createDiodeNode();

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -5;
    compressor.knee.value = 15;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    const biquadFilter = audioContext.createBiquadFilter();
    biquadFilter.type = "highpass";
    biquadFilter.frequency.value = 1000;
    biquadFilter.gain.value = 1.25;

    this.input.connect(effectInput);
    this.input.connect(passthrough);

    passthrough.connect(this.output);

    effectInput.connect(vcInverter1);
    effectInput.connect(vcDiode4);

    vcInverter1.connect(vcDiode3);

    oscillator.connect(vInGain);
    vInGain.connect(vInInverter1);
    vInGain.connect(vcInverter1);
    vInGain.connect(vcDiode4);

    vInInverter1.connect(vInInverter2);
    vInInverter1.connect(vInDiode2);
    vInInverter2.connect(vInDiode1);

    vInDiode1.connect(vInInverter3);
    vInDiode2.connect(vInInverter3);

    vInInverter3.connect(compressor);
    vcDiode3.connect(compressor);
    vcDiode4.connect(compressor);

    effectInput.connect(biquadFilter);
    biquadFilter.connect(compressor);

    compressor.connect(this.output);
  }
}

/**
 * 옛 로봇을 구간 효과로 감싼 임시 어댑터. 구간 전체에 효과를 걸고 길이는 그대로다.
 * 새 로봇으로 바꿀 때 `RobotEffect`와 함께 지운다.
 */
export const robotLegacy = segmentEffect({
  transform: (mid, sampleRate) =>
    renderGraph(mid, sampleRate, mid.length, (ctx, source) => {
      const robot = new RobotEffect(ctx, 0, mid.length / sampleRate);
      source.connect(robot.input);
      robot.output.connect(ctx.destination);
    }),
});
