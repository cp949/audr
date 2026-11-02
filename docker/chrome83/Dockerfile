# Chrome 83 floor 검증용 이미지(docs/adr/0001). apps/demo의 pnpm test:e2e:chrome83이 쓴다.
#
# 공식 하한은 Chrome 75지만 Playwright가 CDP Browser.setDownloadBehavior(Chrome 82+)를 무조건 호출해
# 75~81을 구동할 수 없다. Debian snapshot에는 82.x가 없어 83.x가 자동 검증 가능한 최소 버전이다.
# 구성은 cp949/geul의 docker/chrome83을 따른다.
#
# 오래된 브라우저(미패치 CVE)를 호스트에 직접 깔지 않으려고 컨테이너 안에서만 실행한다.
FROM debian:buster-slim

# 호스트 node_modules를 그대로 마운트해 쓰므로 호스트와 같은 Node major, 루트 packageManager와 같은 pnpm을 쓴다
ARG NODE_VERSION=24.20.0
ARG PNPM_VERSION=10.28.0

RUN set -eux; \
    # 83.0.4103.116-3(2020-07-12 sid snapshot). 같은 버전의 더 이른 리비전(-1)은 libavformat58 의존성이 깨져 설치되지 않는다.
    echo "deb [check-valid-until=no trusted=yes] http://snapshot.debian.org/archive/debian/20200712T145349Z unstable main" > /etc/apt/sources.list; \
    printf 'Acquire::Check-Valid-Until "false";\nAcquire::Retries "5";\n' > /etc/apt/apt.conf.d/99snapshot; \
    apt-get update; \
    # dbus-x11을 먼저 설치해야 libgtk-3-0 의존성이 풀린다(설치 순서를 바꾸면 chromium 설치가 막힌다)
    apt-get install -y --no-install-recommends dbus-x11; \
    apt-get install -y --no-install-recommends chromium=83.0.4103.116-3; \
    apt-get install -y --no-install-recommends curl ca-certificates xz-utils; \
    curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    mkdir -p /usr/local/lib/nodejs; \
    tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs; \
    rm /tmp/node.tar.xz; \
    export PATH="/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin:${PATH}"; \
    # corepack 서명 키 문제를 피하려고 npm 전역 설치로 pnpm을 둔다
    npm install -g "pnpm@${PNPM_VERSION}"; \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin:${PATH}"
WORKDIR /repo
