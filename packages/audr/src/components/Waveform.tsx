import { memo } from "react";
import styles from "./Waveform.module.css";

export type WaveformProps = {
  /** 청크별 RMS 레벨 */
  data: number[];
  width: number;
  height: number;
  /** true이면 막대를 흐리게 그린다. 편집기가 선택이 없을 때 쓴다 */
  dimmed?: boolean;
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
    bars.push(
      <rect
        key={i}
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
