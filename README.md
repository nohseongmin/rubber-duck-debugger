# 🦆 Rubber Duck Debugger (러버덕 디버거)

<p align="center"><b>한국어</b> | <a href="README.en.md">English</a></p>

<p align="center">
  <img src="assets/demo.gif" alt="러버덕 디버거 데모 — 오리를 클릭하면 꽥!" width="480">
</p>

<p align="center">
  바탕화면에 고무오리를 띄우고, 코드가 막힐 때 <b>클릭하면 "꽥!"</b> 하고 대꾸해주는 러버덕 디버깅 데스크탑 위젯.<br>
  Steam의 Bongo Cat처럼 항상 화면 위에 상주하고, <b>이미지·GIF·문구·소리를 전부 커스텀</b>할 수 있다.
</p>

<p align="center">
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/releases/latest"><img src="https://img.shields.io/github/v/release/nohseongmin/rubber-duck-debugger?color=ffcf33&label=release" alt="release"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64-0078D6" alt="platform">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nohseongmin/rubber-duck-debugger" alt="license"></a>
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/stargazers"><img src="https://img.shields.io/github/stars/nohseongmin/rubber-duck-debugger?style=social" alt="stars"></a>
</p>

<p align="center">
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/releases/latest/download/RubberDuckDebugger-Setup-0.2.0.exe"><b>⬇️ 설치파일 다운로드 (Windows)</b></a>
</p>

> 러버덕 디버깅(Rubber Duck Debugging): 막힌 코드를 고무오리에게 한 줄씩 소리 내어 설명하다 보면 스스로 버그를 찾게 된다는 개발자들의 오랜 디버깅 기법.

## ✨ 기능

- **바탕화면 상주**: 투명·프레임 없음·항상 위 표시. 오리만 떠 있고 배경은 안 보인다.
- **클릭하면 꽥**: 오리를 좌클릭하면 합성된 "꽥" 소리 + 랜덤 문구 말풍선 + 스퀴시 애니메이션.
- **둥실둥실 대기 애니메이션**: 가만히 둬도 오리가 살짝 떠서 부유한다. (OS 모션 최소화 설정 시 자동으로 꺼짐)
- **자동 혼잣말**: 가끔 오리가 스스로 말풍선을 띄운다. 간격·소리 여부는 설정에서 조절(기본은 소리 없이 말풍선만).
- **우클릭 메뉴**: 오리를 우클릭 → 위치 이동 / 설정 / GitHub / 닫기.
- **위치 이동 모드**: 메뉴에서 "위치 이동"을 켜면 점선 경계가 나타나고 잡아끌어 옮긴다. `완료` 또는 `Esc`로 종료(위치 자동 저장). 좌클릭=꽥과 이동이 분리돼 헷갈리지 않는다.
- **전역 단축키**: 설정에서 지정한 단축키(기본 `Ctrl+Shift+D`)를 누르면 다른 창을 쓰는 중에도 오리가 꽥 한다.
- **빈 곳은 클릭 투과**: 오리 이외 영역은 마우스가 통과해서 바탕화면 아이콘을 그대로 쓸 수 있다.
- **완전 커스텀**: 캐릭터(내장 오리/이모지/내 이미지·**GIF** 파일·크기), 말풍선 문구 목록, 소리(기본 꽥 합성/내 사운드 파일·볼륨), 표시 시간까지 설정창에서 변경.
- **트레이 상주**: 우클릭 메뉴에서 꽥 테스트 / 설정 / GitHub 열기 / 종료.

> 기본 캐릭터(투명 배경 고무오리 이미지)가 내장돼 있고, 기본 "꽥" 소리는 Web Audio로 실시간 합성한다(포함 오디오 파일 없음). 설정에서 원하는 이미지·GIF·이모지·사운드로 바꿀 수 있다. 애셋 출처는 [CREDITS.md](CREDITS.md).

## 🚀 실행 방법

```bash
# 1) 의존성 설치
npm install

# 2) 실행
npm start
```

실행하면 화면 우하단에 오리가 나타난다. 클릭 → 꽥! 설정은 트레이 아이콘 → "설정…".

> 아이콘(`assets/icon.png`, `assets/tray.png`)은 저장소에 포함돼 있다. 다시 만들려면 `npm run gen-icons`(순수 Node로 placeholder 아이콘 재생성).

### 배포용 설치파일 빌드

```bash
npm run dist
```

`electron-builder`로 Windows(nsis) / macOS(dmg) / Linux(AppImage) 설치파일을 만든다. (`dist/`에 출력)

## 🧩 기술 스택

- **Electron** — 메인 프로세스(Node) + 렌더러(HTML/CSS/JS)
- **Web Audio API** — 의존성 없이 실시간 "꽥" 합성
- **자체 JSON 설정 저장** — `userData/config.json` (외부 스토어 의존성 없음)
- **순수 Node PNG 생성기** — `scripts/gen-icons.js` (바이너리 애셋 미커밋)
- **electron-builder** — 크로스플랫폼 패키징

## 📁 프로젝트 구조

```
rubber-duck-debugger/
├─ src/
│  ├─ main.js          # Electron 메인: 창 생성, 트레이, IPC, 설정 저장
│  ├─ preload.js       # 화이트리스트 IPC 브리지 (contextIsolation)
│  ├─ config.js        # 설정 기본값 + JSON 로드/저장
│  ├─ duck/            # 오리 위젯 (투명창): index.html, duck.css, duck.js
│  └─ settings/        # 설정창: index.html, settings.css, settings.js
├─ scripts/
│  └─ gen-icons.js     # 아이콘 PNG 생성기
├─ assets/             # 생성된 아이콘 (gen-icons 실행 시)
├─ BLUEPRINT.md        # 기획/시장성/BM/보안/로드맵
└─ package.json
```

## 🔐 보안

- 렌더러는 `contextIsolation: true`, `nodeIntegration: false` — preload의 화이트리스트 IPC만 노출.
- CSP로 원격 스크립트 차단(`script-src 'self'`), 로컬 파일만 로드.
- 네트워크 통신·로그인·개인정보 수집 **없음**. 모든 설정은 로컬에만 저장.

## 🗺️ 로드맵

- **v0.2** — ✅ 둥실둥실 대기 부유 · ✅ 자동 혼잣말 · (예정) 말하기 스프라이트
- **v0.3** — 스킨팩 포맷(zip: 이미지+사운드+문구) import, 여러 마리 소환, 키입력 반응
- **v1.0** — 스킨/사운드팩 판매, 자동 업데이트, 코드사이닝, Steam 출시

## 📄 라이선스

코드는 MIT. 기본 "꽥"은 코드로 합성하고 캐릭터 이미지는 프로젝트 소유 애셋이라, 현재 서드파티 저작자 표기가 필요한 번들 애셋은 없다. 애셋 상세는 [CREDITS.md](CREDITS.md).
