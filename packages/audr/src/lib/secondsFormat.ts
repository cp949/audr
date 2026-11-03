// 초 단위 숫자를 로케일의 소수점 기호로 쓴다. Intl.NumberFormat은 Chrome 24부터라 Chrome 75 기준에 맞는다.

/** 값을 소수 `digits`자리 초 숫자로 바꾸는 함수. 천 단위 구분 기호는 넣지 않는다 */
export type SecondsFormat = (value: number, digits?: number) => string;

function createFormatter(locale: string, digits: number): Intl.NumberFormat {
  const options = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  };
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    // 잘못된 태그(RangeError)는 영어 표기로 대체한다
    return new Intl.NumberFormat("en", options);
  }
}

/**
 * 로케일용 초 포맷 함수를 만든다. 자릿수마다 포맷터를 한 번만 만들어 재사용한다.
 * 재생 위치는 매 프레임 바뀌므로 호출마다 포맷터를 만들지 않는다.
 */
export function createSecondsFormat(locale: string): SecondsFormat {
  const formatters = new Map<number, Intl.NumberFormat>();
  return (value, digits = 2) => {
    let formatter = formatters.get(digits);
    if (!formatter) {
      formatter = createFormatter(locale, digits);
      formatters.set(digits, formatter);
    }
    return formatter.format(value);
  };
}
