import type { ComponentType } from "react";
import { App } from "../App";
import { RecordOnlyExample } from "./RecordOnly";
import recordOnlySource from "./RecordOnly.tsx?raw";

/** 왼쪽 메뉴에 나오는 항목 하나 */
export type Example = {
  /** 주소 hash의 일부(`#/<id>`) */
  id: string;
  title: string;
  /** 이 예제가 보여 주는 사용 시나리오 한 문장 */
  summary: string;
  Component: ComponentType;
  /**
   * 화면 아래에 보여 줄 예제 소스. 예제 파일을 `?raw`로 읽어서 화면과 코드가 어긋나지 않는다.
   * 없으면 예제 틀(제목, 설명, 소스) 없이 `Component`만 그린다.
   */
  source?: string;
};

/**
 * 메뉴 순서. 첫 항목이 기본 화면이다.
 * 첫 항목 "통합 데모"는 e2e가 기준으로 삼는 화면이라 틀 없이 그대로 둔다.
 */
export const EXAMPLES: Example[] = [
  {
    id: "full",
    title: "통합 데모",
    summary: "소리 목록, 편집, 녹음, 가져오기, 테마, 다국어를 한 화면에서 시험한다.",
    Component: App,
  },
  {
    id: "record",
    title: "녹음만 쓰기",
    summary: "에디터 없이 RecordDialog만 붙여 마이크 녹음 결과를 받는다.",
    Component: RecordOnlyExample,
    source: recordOnlySource,
  },
];

/** 주소 hash(`#/record` 등)에 맞는 예제를 찾는다. 없거나 모르는 값이면 첫 항목이다. */
export function resolveExample(hash: string): Example {
  const id = hash.replace(/^#\/?/, "");
  return EXAMPLES.find((example) => example.id === id) ?? EXAMPLES[0];
}
