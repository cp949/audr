import styles from "./audio-trimmer.module.css";

export type PlayheadProps = {
  /** 재생 위치 (0~1) */
  playbackPosition: number;
};

export function Playhead({ playbackPosition }: PlayheadProps) {
  return (
    <div className={styles.playheadContainer}>
      <div
        className={styles.playhead}
        style={{ transform: `translateX(${100 * playbackPosition}%)` }}
      />
    </div>
  );
}
