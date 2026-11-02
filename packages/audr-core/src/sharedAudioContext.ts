// 브라우저는 AudioContext를 하나만 만들도록 권장하므로 싱글턴으로 둔다.

let audioContext: AudioContext | undefined;

// touchend는 touchstart와 달리 user activation으로 인정된다(HTML 명세). keydown은 Esc를 제외하고 인정된다.
const RESUME_EVENTS = ["mousedown", "touchstart", "touchend", "keydown"] as const;

/** 리스너가 이미 걸려 있는지. 여러 번 불러도 중복 등록하지 않는 데 쓴다. */
let listening = false;

/**
 * 컨텍스트가 running이 될 때까지 입력마다 resume을 다시 시도한다.
 * 첫 입력이 user activation으로 인정되지 않아 resume이 거부되어도 다음 입력에서 이어서 시도한다.
 */
function resumeOnUserGesture(ctx: AudioContext): void {
  if (listening || ctx.state === "running" || ctx.state === "closed") return;
  if (typeof document === "undefined") return;
  listening = true;
  const detach = () => {
    for (const name of RESUME_EVENTS) document.removeEventListener(name, resume);
    listening = false;
  };
  const resume = () => {
    ctx.resume().then(
      () => {
        if (ctx.state === "running") detach();
      },
      // 거부되면 리스너를 두고 다음 입력에서 다시 시도한다
      () => {},
    );
  };
  for (const name of RESUME_EVENTS) document.addEventListener(name, resume);
}

/** 공유 AudioContext를 돌려준다. 처음 호출할 때 만든다. */
export function getSharedAudioContext(): AudioContext {
  if (!audioContext) {
    const g = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) throw new Error("AudioContext를 쓸 수 없다");
    audioContext = new Ctor();
  }
  // 이미 running이거나 리스너가 걸려 있으면 아무것도 하지 않는다
  resumeOnUserGesture(audioContext);
  return audioContext;
}
