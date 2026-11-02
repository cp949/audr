// 배포 패키지가 공식 browser floor(Chrome 75, docs/adr/0001)를 지키는지 정적으로 검사한다.
//
// 세 검사를 차례로 돌린다. 하나라도 실패하면 종료 코드 1.
// 1. ES: packages/*/dist의 JS를 eslint-plugin-es-x로 검사한다. 문법(?. ?? 등)과 ES 표준 API(Array.prototype.at 등).
// 2. Web API: packages/*/src를 이름 목록으로 검색한다. es-x는 Web API(Blob.arrayBuffer 등)를 보지 않기 때문이다.
// 3. CSS: packages/*/src, dist와 apps/demo/src의 CSS를 stylelint-no-unsupported-browser-features로 검사한다.
//
// 한계: 정적 검사라 동적 접근(obj[name]())과 렌더링 차이는 못 잡는다. 실제 실행 확인은 Chrome 83 E2E가 맡는다.
// dist가 대상이라 빌드 뒤에 실행해야 한다(pnpm verify가 turbo 뒤에 돌린다).

import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import esX from "eslint-plugin-es-x";
import stylelint from "stylelint";

export const repoRoot = resolve(import.meta.dirname, "..");
const FLOOR = "Chrome >= 75";

/** 디렉터리 아래 파일을 재귀로 모은다. 없으면 빈 배열이다. */
function listFiles(directory, pattern) {
  let entries;
  try {
    entries = readdirSync(directory, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => pattern.test(entry) && !entry.split(sep).includes("node_modules"))
    .map((entry) => join(directory, entry))
    .sort();
}

function packageDirectories(root) {
  const packagesRoot = join(root, "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name))
    .sort();
}

const toPosix = (root, file) => relative(root, file).split(sep).join("/");

// ---------------------------------------------------------------------------
// 1. ES 문법·API

/**
 * ES2020+ 분류라 restrict-to-es2019가 막지만 Chrome 75 이하가 이미 지원하는 기능.
 * 값은 MDN browser-compat-data의 최초 지원 Chrome 버전이다.
 */
const allowedBelowFloorRules = {
  "es-x/no-bigint": "off", // Chrome 67
  "es-x/no-dynamic-import": "off", // Chrome 63
  "es-x/no-export-ns-from": "off", // Chrome 72
  "es-x/no-global-this": "off", // Chrome 71
  "es-x/no-import-meta": "off", // Chrome 64
  "es-x/no-numeric-separators": "off", // Chrome 75
  "es-x/no-string-prototype-matchall": "off", // Chrome 73
  "es-x/no-symbol-matchall": "off", // Chrome 73
};

// aggressive 모드는 receiver 타입을 보지 않는다. ES2025 Iterator·Set 메서드 규칙은
// 배열의 map/filter 같은 흔한 이름과 겹쳐 오탐만 낸다. 그래서 이 두 규칙군은 끈다.
const collisionRuleOverrides = Object.fromEntries(
  Object.keys(esX.configs["flat/restrict-to-es2019"].rules ?? {})
    .filter((ruleId) => /^es-x\/no-(?:iterator|set)-prototype-/.test(ruleId))
    .map((ruleId) => [ruleId, "off"]),
);

export function createEsLint(cwd = repoRoot) {
  return new ESLint({
    cwd,
    // 저장소의 다른 설정을 찾지 않고 아래 구성만 쓴다
    overrideConfigFile: true,
    // dist 안의 eslint-disable 주석이 검사를 우회하지 못하게 한다
    allowInlineConfig: false,
    baseConfig: [
      esX.configs["flat/restrict-to-es2019"],
      {
        languageOptions: { ecmaVersion: "latest", sourceType: "module" },
        // dist에는 타입 정보가 없다. 변수 receiver(list.findLast())까지 잡으려면 aggressive가 필요하다.
        settings: { "es-x": { aggressive: true } },
        rules: { ...collisionRuleOverrides, ...allowedBelowFloorRules },
      },
    ],
  });
}

async function checkEs(root) {
  const files = [];
  const failures = [];
  for (const directory of packageDirectories(root)) {
    const found = listFiles(join(directory, "dist"), /\.(?:js|mjs|cjs)$/);
    // 대상이 0건이면 통과가 아니라 검사가 무력화된 것이다
    if (found.length === 0) failures.push(`${toPosix(root, directory)}/dist: 검사할 JS가 없다`);
    files.push(...found);
  }
  if (failures.length > 0) return failures;
  const eslint = createEsLint(root);
  const results = await eslint.lintFiles(files);
  for (const result of results) {
    for (const message of result.messages) {
      failures.push(
        `${toPosix(root, result.filePath)}:${message.line}:${message.column}  ${message.ruleId ?? "parse"}  ${message.message}`,
      );
    }
  }
  console.log(`[browser-floor] ES: dist JS ${files.length}개`);
  return failures;
}

// ---------------------------------------------------------------------------
// 2. Web API

/** Chrome 75에 없는 Web API. 이름 검색이라 오탐이 있을 수 있다. 오탐이나 가드한 사용은 allowlist에 올린다. */
export const webApiDenylist = [
  { api: "Blob.prototype.arrayBuffer", minChrome: 76, pattern: /\.arrayBuffer\(/ },
  { api: "Blob.prototype.stream", minChrome: 76, pattern: /\.stream\(\)/ },
  {
    api: "ClipboardItem / clipboard.write",
    minChrome: 76,
    pattern: /ClipboardItem|clipboard\.write\(/,
  },
  { api: "ElementInternals", minChrome: 77, pattern: /attachInternals|ElementInternals/ },
  { api: "requestVideoFrameCallback", minChrome: 83, pattern: /requestVideoFrameCallback/ },
  { api: "Element.replaceChildren", minChrome: 86, pattern: /replaceChildren/ },
  { api: "navigator.userAgentData", minChrome: 90, pattern: /userAgentData/ },
  { api: "crypto.randomUUID", minChrome: 92, pattern: /randomUUID/ },
  {
    api: "WebCodecs",
    minChrome: 94,
    pattern: /\b(?:AudioData|AudioDecoder|AudioEncoder|VideoFrame)\b/,
  },
  { api: "structuredClone", minChrome: 98, pattern: /structuredClone/ },
  { api: "HTMLInputElement.showPicker", minChrome: 99, pattern: /showPicker/ },
  { api: "CanvasRenderingContext2D.roundRect", minChrome: 99, pattern: /\.roundRect\(/ },
  { api: "HTMLElement.inert", minChrome: 102, pattern: /\binert\b/ },
  { api: "AbortSignal.timeout / any", minChrome: 103, pattern: /AbortSignal\.(?:timeout|any)\b/ },
  { api: "Element.checkVisibility", minChrome: 105, pattern: /checkVisibility/ },
  { api: "Popover API", minChrome: 114, pattern: /showPopover|hidePopover|\bpopover=/ },
  { api: "scrollend 이벤트", minChrome: 114, pattern: /scrollend/ },
];

/** 가드나 ponyfill로 처리한 사용. 파일과 API 이름이 모두 맞아야 허용한다. */
export const webApiAllowlist = [
  {
    file: "packages/audr-core/src/decodeAudioFile.ts",
    api: "Blob.prototype.arrayBuffer",
    reason: "typeof 가드 뒤 Response(Chrome 42)로 대신 읽는다",
  },
  {
    file: "packages/audr/src/lib/shortcuts.ts",
    api: "navigator.userAgentData",
    reason: "옵셔널 접근 뒤 navigator.platform으로 대신한다",
  },
];

/** sources: [{ file, text }]. 허용 목록에 없는 사용을 돌려준다. */
export function findWebApiViolations(sources, allowlist = webApiAllowlist) {
  const violations = [];
  for (const { file, text } of sources) {
    const lines = text.split("\n");
    for (const entry of webApiDenylist) {
      if (allowlist.some((allowed) => allowed.file === file && allowed.api === entry.api)) continue;
      lines.forEach((line, index) => {
        if (entry.pattern.test(line)) {
          violations.push(`${file}:${index + 1}  ${entry.api} (Chrome ${entry.minChrome}+)`);
        }
      });
    }
  }
  return violations;
}

function checkWebApi(root) {
  const sources = [];
  for (const directory of packageDirectories(root)) {
    for (const file of listFiles(join(directory, "src"), /\.(?:ts|tsx)$/)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      sources.push({ file: toPosix(root, file), text: readFileSync(file, "utf8") });
    }
  }
  if (sources.length === 0) return ["packages/*/src: 검사할 소스가 없다"];
  console.log(`[browser-floor] Web API: 소스 ${sources.length}개`);
  return findWebApiViolations(sources);
}

// ---------------------------------------------------------------------------
// 3. CSS

// Chrome 85 이하는 선택자 목록에 모르는 선택자가 하나라도 있으면 규칙 전체를 버린다.
// :focus-visible(86) 단독 규칙은 점진 적용으로 허용하지만, 다른 선택자와 섞는 것은 막는다.
const MIXED_RULE = "audr/no-mixed-unsupported-selector";
const UNSUPPORTED_SELECTOR = /:focus-visible|:is\(|:where\(|:has\(/;

const mixedSelectorPlugin = stylelint.createPlugin(MIXED_RULE, (enabled) => (root, result) => {
  if (!enabled) return;
  root.walkRules((rule) => {
    const selectors = rule.selectors ?? [];
    if (selectors.length < 2 || !selectors.some((s) => UNSUPPORTED_SELECTOR.test(s))) return;
    stylelint.utils.report({
      ruleName: MIXED_RULE,
      result,
      node: rule,
      message: `Chrome 75~85가 모르는 선택자를 다른 선택자와 한 목록에 두면 규칙 전체가 무시된다: "${rule.selector}" (${MIXED_RULE})`,
    });
  });
});

export const stylelintConfig = {
  plugins: ["stylelint-no-unsupported-browser-features", mixedSelectorPlugin],
  rules: {
    "plugin/no-unsupported-browser-features": [
      true,
      {
        browsers: [FLOOR],
        severity: "error",
        // 부분 지원은 끈다. overflow(단일 값), clip-path: inset()(Chrome 55)처럼 audr가 쓰는 범위는 모두 지원되고
        // 부분 지원 표시만 오탐으로 남기 때문이다.
        ignorePartialSupport: true,
        // :focus-visible은 단독 규칙에서만 쓴다(점진 적용). 섞어 쓰는 경우는 MIXED_RULE이 잡는다.
        ignore: ["css-focus-visible"],
      },
    ],
    [MIXED_RULE]: true,
    // 부분 지원으로 분류돼 위에서 빠지지만 Chrome 75에 없는 속성·값.
    // inset은 소스에 top/right/bottom/left로 써도 CSS 압축기가 target에 따라 만들어 낼 수 있어 dist도 본다.
    "property-disallowed-list": [
      [
        "inset", // Chrome 87
        "/^inset-/", // Chrome 87
        "/^(?:margin|padding|border)-(?:block|inline)$/", // 논리 속성 축약형, Chrome 87
        "/^border-(?:start|end)-(?:start|end)-radius$/", // Chrome 89
      ],
      { severity: "error" },
    ],
    "declaration-property-value-disallowed-list": [
      { "/^overflow(?:-x|-y)?$/": ["/\\bclip\\b/"] }, // overflow: clip, Chrome 90
      { severity: "error" },
    ],
  },
};

async function checkCss(root) {
  const files = [];
  const failures = [];
  for (const directory of packageDirectories(root)) {
    files.push(...listFiles(join(directory, "src"), /\.css$/));
    files.push(...listFiles(join(directory, "dist"), /\.css$/));
  }
  files.push(...listFiles(join(root, "apps", "demo", "src"), /\.css$/));
  if (files.length === 0) return ["검사할 CSS가 없다"];
  const { results } = await stylelint.lint({ files, config: stylelintConfig, configBasedir: root });
  for (const result of results) {
    for (const warning of result.warnings) {
      failures.push(`${toPosix(root, result.source)}:${warning.line}  ${warning.text}`);
    }
  }
  console.log(`[browser-floor] CSS: ${files.length}개`);
  return failures;
}

// ---------------------------------------------------------------------------

async function main() {
  const sections = [
    ["ES 문법·API", await checkEs(repoRoot)],
    ["Web API", checkWebApi(repoRoot)],
    ["CSS", await checkCss(repoRoot)],
  ];
  let failed = false;
  for (const [name, failures] of sections) {
    if (failures.length === 0) continue;
    failed = true;
    console.error(`\n[browser-floor] ${name} 위반 ${failures.length}건:`);
    for (const failure of failures) console.error(`  ${failure}`);
  }
  if (failed) {
    console.error(
      `\n[browser-floor] ${FLOOR} 기준 실패. 가드·ponyfill로 처리한 Web API는 webApiAllowlist에 이유와 함께 올린다.`,
    );
    process.exit(1);
  }
  console.log(`[browser-floor] ${FLOOR} 기준 통과`);
}

// 다른 모듈이 import할 때는 검사를 돌리지 않는다
const isDirectRun =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isDirectRun) await main();
