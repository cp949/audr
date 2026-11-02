// AudioBufferPlayer 수명 관리를 맡는 훅.
import { AudioBufferPlayer } from "@cp949/audr-core";
import { useEffect, useRef } from "react";

export type PlaybackStepOptions = {
  samples: Float32Array;
  sampleRate: number;
  trimStart: number;
  trimEnd: number;
  onPlay: () => void;
  onStopPlaying: () => void;
  onSetPlayhead: (playhead: number) => void;
};

export function usePlaybackStep({
  samples,
  sampleRate,
  trimStart,
  trimEnd,
  onPlay,
  onStopPlaying,
  onSetPlayhead,
}: PlaybackStepOptions) {
  const playerRef = useRef<AudioBufferPlayer | null>(null);

  useEffect(() => {
    const player = new AudioBufferPlayer(samples, sampleRate);
    playerRef.current = player;
    return () => {
      player.stop();
      playerRef.current = null;
    };
  }, [samples, sampleRate]);

  const play = () => {
    playerRef.current?.play(trimStart, trimEnd, onSetPlayhead, onStopPlaying);
    onPlay();
  };

  const stopPlaying = () => {
    playerRef.current?.stop();
    onStopPlaying();
  };

  return { play, stopPlaying };
}
