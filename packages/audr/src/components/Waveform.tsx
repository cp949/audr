import { memo } from "react";
import styles from "./Waveform.module.css";

export type WaveformProps = {
  /** 청크별 RMS 레벨 */
  data: number[];
  width: number;
  height: number;
  /** true이면 막대를 흐리게 그린다. 편집기가 쓴다 */
  dimmed?: boolean;
  /** dimmed일 때 흐리지 않게 둘 구간(0~1 비율). 막대 가운데가 구간 안이면 원래 색이다. 없으면 모든 막대가 흐리다 */
  highlight?: { start: number; end: number } | null;
};

/** 막대 한 칸의 폭(막대 3px + 간격 2px) */
const BAR_PITCH = 5;
const BAR_WIDTH = 3;
/** 무음 구간도 점으로 보이게 하는 최소 높이 */
const MIN_BAR_HEIGHT = 2;

// 막대 계산은 비싸므로 data가 바뀔 때만 다시 그린다
export const Waveform = memo(function Waveform({
  data,
  width,
  height,
  dimmed = false,
  highlight = null,
}: WaveformProps) {
  const barCount = data.length === 0 ? 0 : Math.max(1, Math.floor(width / BAR_PITCH));
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    // 막대 하나가 맡는 data 구간. data가 막대보다 적으면 한 값이 여러 막대에 걸친다
    const from = Math.floor((i * data.length) / barCount);
    const to = Math.max(from + 1, Math.ceil(((i + 1) * data.length) / barCount));
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, data[j] as number);
    // 구간의 최댓값을 쓰면 짧은 소리도 막대에서 사라지지 않는다
    const barHeight = Math.min(height, Math.max(MIN_BAR_HEIGHT, height * peak));
    const center = (i + 0.5) / barCount;
    const inHighlight = highlight !== null && center >= highlight.start && center <= highlight.end;
    bars.push(
      <rect
        key={i}
        data-dim={dimmed && !inHighlight ? "" : undefined}
        x={i * BAR_PITCH + (BAR_PITCH - BAR_WIDTH) / 2}
        y={(height - barHeight) / 2}
        width={BAR_WIDTH}
        height={barHeight}
        rx={BAR_WIDTH / 2}
      />,
    );
  }

  return (
    <svg
      className={styles.container}
      viewBox={`0 0 ${width} ${height}`}
      data-waveform=""
      data-dimmed={dimmed ? "" : undefined}
    >
      <g className={styles.bars}>{bars}</g>
    </svg>
  );
});
