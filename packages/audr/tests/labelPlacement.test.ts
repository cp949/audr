import { describe, expect, it } from "vitest";
import { centerOnRange, placeLabel } from "../src/lib/labelPlacement";

// 영역 폭 600, 글자 폭 100, 핸들 여유 30 기준
const place = (start: number, end: number, label = 100, area = 600) =>
  placeLabel(start, end, label, area, 30);

describe("placeLabel", () => {
  it("선택이 글자보다 넓으면 선택의 가운데에 둔다", () => {
    // 선택 100~500(폭 400): 가운데 300, 글자 왼쪽 끝은 250
    expect(place(100, 500)).toBe(250);
  });

  it("선택 폭이 글자 폭과 같으면 선택 시작에 맞춘다", () => {
    expect(place(200, 300)).toBe(200);
  });

  it("선택이 좁고 오른쪽에 자리가 있으면 선택 끝 오른쪽에 핸들 여유만큼 띄워 둔다", () => {
    expect(place(50, 70)).toBe(100);
    expect(place(400, 410)).toBe(440);
  });

  it("오른쪽 자리가 글자 폭에 딱 맞으면 오른쪽에 둔다", () => {
    expect(place(450, 470)).toBe(500);
  });

  it("오른쪽에 자리가 없으면 선택 시작 왼쪽에 핸들 여유만큼 띄워 둔다", () => {
    // 끝 580 + 30 + 100이 영역을 넘는다
    expect(place(560, 580)).toBe(430);
  });

  it("양쪽 모두 자리가 없으면 선택 가운데를 영역 안으로 밀어 둔다", () => {
    expect(place(100, 120, 200, 300)).toBe(10);
  });

  it("글자가 영역보다 넓으면 왼쪽 끝(0)에 둔다", () => {
    expect(place(10, 20, 700)).toBe(0);
  });

  it("길이 0 선택도 같은 규칙을 따른다", () => {
    expect(place(300, 300)).toBe(330);
    expect(place(600, 600)).toBe(470);
  });
});

describe("centerOnRange", () => {
  // 영역 폭 600, 상자 폭 200, 가장자리 여유 4 기준
  const center = (start: number, end: number) => centerOnRange(start, end, 200, 600, 4);

  it("선택 가운데에 상자 가운데를 맞춘다", () => {
    expect(center(200, 400)).toBe(200);
    expect(center(250, 350)).toBe(200);
  });

  it("왼쪽 끝을 넘으면 가장자리 여유만큼 띄운다", () => {
    expect(center(0, 20)).toBe(4);
  });

  it("오른쪽 끝을 넘으면 오른쪽 끝에서 여유만큼 띄운다", () => {
    expect(center(580, 600)).toBe(396);
  });

  it("상자가 영역보다 넓으면 왼쪽 여유 위치에 둔다", () => {
    expect(centerOnRange(100, 200, 700, 600, 4)).toBe(4);
  });
});
