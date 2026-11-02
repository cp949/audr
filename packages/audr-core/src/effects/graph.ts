// Web Audio 노드 그래프로 처리하는 효과가 쓰는 오프라인 렌더링 도우미.
// OfflineAudioContext는 vitest(node)에 없어 이 파일을 쓰는 효과는 e2e에서 확인한다.

/**
 * 모노 샘플을 버퍼 소스로 재생하는 오프라인 그래프를 `outLength`샘플만큼 렌더링해 새 배열로 돌려준다.
 * `build`는 소스에서 `ctx.destination`까지 노드를 잇는다. 소스 시작은 이 함수가 맡는다.
 * OfflineAudioContext가 최소 2샘플을 요구하므로 `outLength`가 2 미만이어도 2샘플로 렌더링하고 잘라서 돌려준다.
 */
export async function renderGraph(
  samples: Float32Array,
  sampleRate: number,
  outLength: number,
  build: (ctx: OfflineAudioContext, source: AudioBufferSourceNode) => void,
): Promise<Float32Array> {
  const length = Math.floor(outLength);
  const ctx = new OfflineAudioContext(1, Math.max(2, length), sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  build(ctx, source);
  source.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice(0, length);
}
