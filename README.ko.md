# 🦆 Rubber Duck Debugger (러버덕 디버거)

<p align="center"><a href="README.md">English</a> | <b>한국어</b></p>

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
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/releases/latest/download/RubberDuckDebugger-Setup.exe"><b>⬇️ 설치파일 다운로드 (Windows) — 클릭</b></a><br>
  <sub>다운로드 → 실행 → 끝. npm 필요 없음.</sub>
</p>

> 러버덕 디버깅(Rubber Duck Debugging): 막힌 코드를 고무오리에게 한 줄씩 소리 내어 설명하다 보면 스스로 버그를 찾게 된다는 개발자들의 오랜 디버깅 기법.

## ✨ 기능

- **바탕화면 상주**: 투명·프레임 없음·항상 위 표시. 오리만 떠 있고 배경은 안 보인다.
- **클릭하면 꽥**: 오리를 좌클릭하면 합성된 "꽥" 소리 + 랜덤 문구 말풍선 + 스퀴시 애니메이션.
- **둥실둥실 대기 애니메이션**: 가만히 둬도 오리가 살짝 떠서 부유한다. 설정에서 끌 수 있고, OS 모션 최소화 설정이면 자동으로 꺼진다.
- **자동 혼잣말**: 가끔 오리가 스스로 말풍선을 띄운다. 간격·소리 여부는 설정에서 조절(기본은 소리 없이 말풍선만).
- **스킨팩(`.rduck`)**: 캐릭터(이미지/GIF/WebP)·소리·문구·말풍선 색을 한 파일로 묶어 **가져오기 → 전환 → 삭제**. 샘플: [`skins/pinky-duck.rduck`](skins/pinky-duck.rduck) → 설정 → 스킨 → "스킨팩 가져오기".
- **우클릭 메뉴**: 오리를 우클릭 → 위치 이동 / 설정 / GitHub / 닫기.
- **위치 이동 모드**: 메뉴에서 "위치 이동"을 켜면 점선 경계가 나타나고 잡아끌어 옮긴다. `완료` 또는 `Esc`로 종료(위치 자동 저장). 좌클릭=꽥과 이동이 분리돼 헷갈리지 않는다.
- **전역 단축키(액션 할당)**: 키 조합을 액션(**꽥 / 다음 스킨 / 숨기기·보이기 / 설정 열기**)에 자유롭게 할당. 여러 개 등록 가능하고, 다른 창을 쓰는 중에도 작동한다. 기본으로 등록된 단축키는 없다(직접 추가).
- **PC 시작 시 자동 실행**: 설정에서 켜면 윈도우 시작할 때 오리가 같이 뜬다. (기본 꺼짐)
- **빈 곳은 클릭 투과**: 오리 이외 영역은 마우스가 통과해서 바탕화면 아이콘을 그대로 쓸 수 있다.
- **완전 커스텀**: 캐릭터(내장 오리/이모지/내 이미지·**GIF** 파일·크기), 말풍선 문구 목록, 소리(기본 꽥 합성/내 사운드 파일·볼륨), 표시 시간까지 설정창에서 변경.
- **트레이 상주**: 우클릭 메뉴에서 꽥 테스트 / 설정 / GitHub 열기 / 종료.

> 기본 캐릭터(투명 배경 고무오리 이미지)가 내장돼 있고, 기본 "꽥" 소리는 Web Audio로 실시간 합성한다(포함 오디오 파일 없음). 설정에서 원하는 이미지·GIF·이모지·사운드로 바꿀 수 있다. 애셋 출처는 [CREDITS.md](CREDITS.md).

## 📥 설치 (일반 사용자)

**npm 같은 거 필요 없습니다. 설치파일만 받으면 끝.**

1. **[⬇️ 설치파일 다운로드](https://github.com/nohseongmin/rubber-duck-debugger/releases/latest/download/RubberDuckDebugger-Setup.exe)** 를 받아 실행
2. "알 수 없는 게시자 / Windows에서 PC를 보호했습니다(SmartScreen)" 경고가 뜨면 → **추가 정보 → 실행** (코드사이닝 미적용이라 뜨는 정상 경고입니다)
3. 화면 우하단에 오리가 나타납니다. **좌클릭 → 꽥!** · 설정/종료는 오리 **우클릭** 또는 트레이 아이콘

> 새 버전은 [릴리즈](https://github.com/nohseongmin/rubber-duck-debugger/releases)에서 다시 받으면 됩니다. (자동 업데이트는 로드맵)

## 🛠 개발자용 — 소스에서 실행/빌드

```bash
npm install
npm start        # 개발 실행
npm test         # 스킨 임포트 보안 테스트
npm run dist     # 설치파일 빌드 → dist/ (Windows nsis / macOS dmg / Linux AppImage)
```

## 🎨 스킨팩 만들기 (`.rduck`)

`skin.json` + 애셋을 zip으로 묶고 확장자를 `.rduck`로 바꾸면 끝. (설정 → 스킨 → 가져오기)

```
my-skin.rduck (zip)
├─ skin.json
├─ char.webp     # 이미지/GIF/APNG/WebP 모두 가능(애니메이션 OK)
└─ quack.mp3     # 선택(없으면 합성 꽥 사용)
```

```json
{
  "formatVersion": 1,
  "id": "my-skin",
  "name": "내 스킨",
  "author": "닉네임",
  "version": "1.0.0",
  "character": { "image": "char.webp", "size": 130 },
  "sound":     { "file": "quack.mp3", "volume": 0.6 },
  "phrases":   ["삑!", "그 코드 다시 읽어봐"],
  "bubble":    { "textColor": "#5a1040", "bgColor": "#ffe3f1" }
}
```

> **보안**: 스킨은 **순수 애셋**입니다. 코드 실행 없음. 가져올 때 경로 탈출(zip slip)·실행파일·용량 폭탄·매니페스트 위조를 검사하고 허용된 이미지/오디오만 추출합니다. ([테스트](test/skins.test.js) · [설계](docs/DESIGN-v0.3.md))

## 🧩 기술 스택

- **Electron** — 메인 프로세스(Node) + 렌더러(HTML/CSS/JS)
- **Web Audio API** — 의존성 없이 실시간 "꽥" 합성
- **자체 JSON 설정 저장** — `userData/config.json` (외부 스토어 의존성 없음)
- **electron-builder** — 크로스플랫폼 패키징

## 📁 프로젝트 구조

```
rubber-duck-debugger/
├─ src/
│  ├─ main.js          # Electron 메인: 창 생성, 트레이, IPC, 설정 저장
│  ├─ preload.js       # 화이트리스트 IPC 브리지 (contextIsolation)
│  ├─ config.js        # 설정 기본값 + JSON 로드/저장
│  ├─ skins.js         # 스킨팩(.rduck) 파싱·검증·설치
│  ├─ duck/            # 오리 위젯 (투명창): index.html, duck.css, duck.js
│  └─ settings/        # 설정창: index.html, settings.css, settings.js
├─ test/               # 스킨 임포트 보안 테스트
├─ assets/             # 오리 이미지, 아이콘, 데모 GIF
├─ BLUEPRINT.md        # 기획/시장성/BM/보안/로드맵
└─ package.json
```

## 🔐 보안

- 렌더러는 `contextIsolation: true`, `nodeIntegration: false` — preload의 화이트리스트 IPC만 노출.
- CSP로 원격 스크립트 차단(`script-src 'self'`), 로컬 파일만 로드.
- 네트워크 통신·로그인·개인정보 수집 **없음**. 모든 설정은 로컬에만 저장.

## 🗺️ 로드맵

- **v0.2** — ✅ 둥실둥실 대기 부유 · ✅ 자동 혼잣말 · (예정) 말하기 스프라이트
- **v0.3** — ✅ 스킨팩(`.rduck`) 임포트·적용·관리 · ✅ 할당 가능한 액션 핫키 ([설계](docs/DESIGN-v0.3.md))
- **v0.4** — ✅ PC 시작 시 자동 실행 · ✅ 둥실둥실 on/off · ✅ 기본 단축키 없음 · (다음) 여러 마리 소환
- **v1.0** — **Steam 출시 + 창작마당(Workshop) UGC 지원**, 자동 업데이트, 코드사이닝

## 📄 라이선스

코드는 MIT. 기본 "꽥"은 코드로 합성하고 캐릭터 이미지는 프로젝트 소유 애셋이라, 현재 서드파티 저작자 표기가 필요한 번들 애셋은 없다. 애셋 상세는 [CREDITS.md](CREDITS.md).
