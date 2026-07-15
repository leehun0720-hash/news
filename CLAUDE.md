# news-to-video-script-engine

뉴스 기사 텍스트 → Gemini 대본 생성 → Pexels 배경영상 + TTS 음성 다운로드 → moviepy로 자막 합성 → 최종 뉴스 쇼츠 영상(`output/final_news.mp4`) 생성 파이프라인.

원래 Google AI Studio(Linux 컨테이너)용 앱을 Windows 11 로컬로 내려받은 프로젝트.

## 구조

- `server.ts` — Express + Vite 개발 서버 (포트 3000). `/api/generate`가 Python 파이프라인을 spawn, `/api/status`로 폴링, `/output` 정적 서빙
- `src/App.tsx` — React 프런트엔드 (뉴스 입력, API 키 설정 탭, 결과/영상 표시)
- `pipeline.py` — 파이프라인 오케스트레이터 (stdin으로 JSON 입력, `RESULT:` 접두사 줄로 결과 출력)
- `script_engine.py` — Gemini(`gemini-3.5-flash`)로 JSON 대본 생성
- `asset_manager.py` — Pexels 영상 다운로드 + OpenAI TTS (실패 시 gTTS 폴백)
- `video_composer.py` — moviepy **2.x** 로 자막 합성 및 렌더링
- `patch.js` — App.tsx에 폴링 코드를 주입했던 일회성 패치 스크립트 (**이미 적용됨**, 재실행 불필요)

## 실행 방법 (Windows)

```
npm run dev        # http://localhost:3000
```

- Node 의존성: `npm install`
- Python 의존성: `npm run setup:py` (Python 3.12로 `.venv` 생성 + google-genai, python-dotenv, requests, openai, moviepy, gtts 설치)
- API 키: UI 설정 탭(localStorage → 요청 바디로 전달) 또는 `.env` 파일
  - `GEMINI_API_KEY` 필수, `PEXELS_API_KEY` 필수, `OPENAI_API_KEY` 선택(없으면 gTTS 폴백)

## 디버깅 이력 (2026-07-14)

Windows 이식 과정의 환경 문제 4건 + 코드 버그 2건을 수정함.

### 환경 문제 (수정 완료)

1. **`package.json` preinstall** — `wget`으로 pip을 받는 Linux 전용 스크립트라 `npm install` 자체가 실패 → 제거하고 `setup:py` 스크립트로 대체
2. **`.venv`가 Linux용 껍데기** (`bin/`만 존재) → Python 3.12(`C:\Users\unexu\AppData\Local\Programs\Python\Python312`)로 재생성, moviepy 2.1.2 설치됨
3. **`server.ts`가 `python3` 하드코딩** → `.venv/Scripts/python.exe` 우선 사용하도록 수정. `PYTHONIOENCODING=utf-8`, `PYTHONUNBUFFERED=1` 환경변수 추가 (cp949 한글 로그 깨짐 방지)
4. **`NanumGothic.ttf` 손상** — 파일 내부에 UTF-8 replacement 바이트(`efbfbd`)가 섞여 있어 Pillow가 로드 불가 (다운로드 시 바이너리가 텍스트로 재인코딩된 것). `video_composer.py`의 `_pick_korean_font()`가 유효성 검사 후 `C:\Windows\Fonts\malgun.ttf`(맑은 고딕)로 폴백. **나눔고딕을 쓰려면 정상 TTF로 파일만 교체하면 자동 인식됨**

### 코드 버그 (수정 완료)

5. **`video_composer.py` moviepy 1.0.3 → 2.x 마이그레이션** — 구 API(`moviepy.editor`, `subclip`, `set_audio`, `set_position`, `fontsize`)를 2.x API(`moviepy`, `subclipped`, `with_audio`, `with_position`, `font_size`)로 변경. 2.x TextClip은 Pillow 기반이라 **ImageMagick 설치 불필요**. 자막 배경은 `#00000080`(rgba hex). 오디오가 비디오보다 길면 오디오를 자르는 방어 코드 추가
6. **`App.tsx` 로딩 스피너 버그** — `handleGenerate`의 `finally { setIsGenerating(false) }`가 폴링 시작 직후 스피너를 꺼버림 → `catch`로 이동. 완료/에러 시 폴링 콜백이 끔
7. **`server.ts` 에러 메시지** — 실패 시 "Pipeline failed"만 표시되던 것을 stderr 마지막 3줄 포함하도록 개선

### 정리한 것

- 이전 실패 실행이 남긴 0바이트 파일 삭제 (assets/videos/*, assets/audios/*, output/final_news.mp4, 루트의 moviepy 임시 mp4, get-pip.py)
- `.claude/launch.json` 추가 (dev-server, 포트 3000)

### 검증 완료

- 더미 영상(ColorClip) + gTTS 한국어 음성 + 한글 자막으로 `render_final_video()` 전체 실행 → mp4 정상 생성 확인
- `tsc --noEmit` 통과
- `/api/generate` → venv Python 정상 기동, 키 없을 때 에러가 프런트까지 전달되는 것 확인

## 기능 추가 이력 (2026-07-14)

1. **영상 자동 다운로드** — 파이프라인 완료 시 `App.tsx`의 `downloadVideo()`가 `/output/final_news.mp4`를 blob으로 받아 `news_video_<타임스탬프>.mp4`로 자동 저장
2. **초기화** — 입력창 옆 "초기화" 버튼(`resetAll()`) + 자동 다운로드 완료 시 화면 자동 초기화(완료 안내 문구는 유지). 서버 쪽 `POST /api/reset`이 `currentJob`을 idle로 되돌림 (실행 중에는 400)
3. **API 연결 상태 확인** — 설정 탭 하단 "API 연결 상태" 섹션. `POST /api/check-keys`가 서버에서 각 API에 가벼운 인증 요청을 보내 `ok / fail / missing` 반환
   - Gemini: `GET /v1beta/models` (`x-goog-api-key` 헤더). **잘못된 키는 400(API_KEY_INVALID)을 반환**하므로 400/401/403을 인증 실패로 처리
   - OpenAI: `GET /v1/models` (Bearer)
   - Pexels: `GET /videos/search` — **주의: Pexels 검색 API는 키가 없거나 틀려도 200을 반환함** (2026-07 확인). 즉 이 체크는 키 유효성이 아니라 "파이프라인이 쓰는 호출이 실제로 동작하는지"를 검증하는 것

## UI 디자인 (2026-07-14 리디자인)

ALPHACUT 스타일의 다크 + 퍼플-핑크 그라데이션 테마 (사용자가 스크린샷으로 요청).

- 배경: `#0a0a11` + 고정 배치된 퍼플/인디고/핑크 블러 글로우 3개 (`blur-[120~140px]`)
- 포인트 그라데이션: `from-indigo-500 via-purple-500 to-pink-500` (CTA 버튼, 탭 활성, 로고)
- 카드: `bg-white/[0.03] border-white/10 rounded-2xl backdrop-blur-sm`
- 입력창: `bg-black/40 border-white/10`, 포커스 시 퍼플 링
- 브랜딩: 헤더 로고 "NEWSCUT" (CUT 부분 그라데이션), 히어로 섹션(배지 칩 + 그라데이션 h2 "완성된 쇼츠 영상으로"), 실행 버튼 문구 "쇼츠로 변환하기"
- 상태 색: 성공 emerald-400, 실패 red-400, 미입력 gray-500/600
- `index.html`: 제목 "NEWSCUT — 뉴스 쇼츠 자동 생성", body 배경 인라인 지정(흰 화면 깜빡임 방지)

## Windows 패키징 (2026-07-15)

Electron + PyInstaller + electron-builder(NSIS) 조합. `npm run dist:win` 한 방으로 `release/NEWSCUT Setup 1.0.0.exe` 생성.

- **`electron/main.cjs`** — 빈 포트를 찾아 `dist/server.cjs`(express 번들)를 require하고 BrowserWindow에 로드. 작업 폴더는 `%APPDATA%/NEWSCUT/work` (`APP_DATA_DIR` env)
- **`server.ts` 패키징 대응** — `PORT`/`APP_DATA_DIR`/`PIPELINE_EXE`/`STATIC_DIR` env 지원, vite는 dev 분기에서만 동적 import (프로덕션 번들 제외), 리슨 주소 127.0.0.1
- **`build:py`** — PyInstaller onedir로 `dist-py/pipeline/pipeline.exe` 생성. **`--copy-metadata imageio` 필수** (없으면 imageio import 시 PackageNotFoundError), `--collect-all imageio_ffmpeg`로 ffmpeg 바이너리 포함. npm 스크립트는 cmd.exe로 실행되므로 `.venv\\Scripts\\` 백슬래시 경로 필요
- **`pipeline.py --selftest`** — 패키징 검증용 플래그 (moviepy/ffmpeg/폰트 로드 확인)
- exe는 인스톨 폴더가 아닌 cwd(작업 폴더)에 assets/output을 생성하므로 Program Files 쓰기 권한 문제 없음

## 주의사항

- `asset_manager.py`는 다운로드/TTS 실패 시 **0바이트 파일을 생성**해 파이프라인 중단을 막음. `video_composer.py`는 0바이트 비디오를 건너뜀. 디버깅 시 0바이트 에셋이 보이면 해당 API 호출이 실패한 것
- 서버는 동시에 하나의 작업만 처리 (`currentJob` 전역 상태, running 중 재요청 시 400)
- `gemini-3.5-flash`는 2026-07 기준 유효한 GA 모델명 (구모델 gemini-2.0-*는 2026-06-01 서비스 종료됨)
