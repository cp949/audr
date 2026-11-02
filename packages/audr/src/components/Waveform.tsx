import { memo } from "react";
import styles from "./Waveform.module.css";

export type WaveformProps = {
  /** 청크별 RMS 레벨 */
  data: number[];
  width: number;
  height: number;
};

// 파형 계산은 비싸므로 data가 바뀔 때만 다시 그린다
export const Waveform = memo(function Waveform({ data, width, height }: WaveformProps) {
  // Never want a density of points higher than the number of pixels
  // This is very conservative, could be far fewer points because of curve smoothing.
  // Drawing too many points seems to cause an explosion in browser
  // composite time when animating the playhead
  const takeEveryN = Math.ceil(data.length / width);

  const filteredData =
    takeEveryN === 1 ? data.slice(0) : data.filter((_, i) => i % takeEveryN === 0);

  // Need at least two points to render waveform.
  if (filteredData.length === 1) {
    filteredData.push(filteredData[0] as number);
  }

  const maxIndex = filteredData.length - 1;
  const points: Array<[number, number]> = [
    ...filteredData.map((v, i): [number, number] => [width * (i / maxIndex), (height * v) / 2]),
    ...filteredData
      .reverse()
      .map((v, i): [number, number] => [width * (1 - i / maxIndex), (-height * v) / 2]),
  ];
  const pathComponents = points.map(([x, y], i) => {
    const [nx, ny] = points[i < points.length - 1 ? i + 1 : 0] as [number, number];
    return `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  });

  return (
    <svg className={styles.container} viewBox={`0 0 ${width} ${height}`}>
      <g transform={`scale(1, -1) translate(0, -${height / 2})`}>
        <path
          className={styles.waveformPath}
          d={`M0 0${pathComponents.join(" ")}Z`}
          strokeLinejoin="round"
          strokeWidth={1}
        />
      </g>
    </svg>
  );
});
