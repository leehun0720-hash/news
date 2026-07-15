# NEWSCUT — 뉴스 쇼츠 자동 생성

뉴스 기사를 붙여넣으면 AI가 대본 작성 → 배경 영상 수집 → 나레이션(TTS) → 자막 합성까지 자동으로 처리해 쇼츠 영상(mp4)을 만들어주는 파이프라인입니다.

## 동작 방식

1. **대본 생성** — Gemini가 기사를 씬 단위 JSON 대본(나레이션·자막·검색 키워드)으로 변환
2. **에셋 수집** — 씬별로 Pexels에서 배경 영상 다운로드 + OpenAI TTS(실패 시 gTTS 폴백)로 나레이션 생성
3. **영상 합성** — moviepy 2.x로 영상·음성·한글 자막을 합성해 `output/final_news.mp4` 렌더링
4. 완료되면 브라우저에서 자동 다운로드

## 실행 방법

**사전 요구사항:** Node.js 18+, Python 3.12+

```bash
# 1. Node 의존성 설치
npm install

# 2. Python 가상환경 + 의존성 설치
npm run setup:py

# 3. 개발 서버 실행
npm run dev   # http://localhost:3000
```

## API 키 설정

웹 UI의 **설정 탭**에 입력하거나, 프로젝트 루트에 `.env` 파일을 생성하세요 (`.env.example` 참고).

| 키 | 용도 | 필수 여부 |
|---|---|---|
| `GEMINI_API_KEY` | 대본 생성 | 필수 |
| `PEXELS_API_KEY` | 배경 영상 다운로드 | 필수 |
| `OPENAI_API_KEY` | TTS 나레이션 | 선택 (없으면 gTTS 사용) |

설정 탭의 **연결 상태 확인하기** 버튼으로 각 키가 정상 동작하는지 미리 검증할 수 있습니다.

## Windows 설치 파일 만들기

```bash
npm run dist:win
```

`release/NEWSCUT Setup 1.0.0.exe` 인스톨러가 생성됩니다. 설치된 앱은 Node.js·Python 없이 단독 실행되며(Electron + PyInstaller 번들), 생성된 영상 등 작업 파일은 `%APPDATA%\NEWSCUT\work`에 저장됩니다.

## 기술 스택

- **프런트엔드**: React 19 + Vite + Tailwind CSS 4
- **서버**: Express (tsx) — Python 파이프라인을 자식 프로세스로 실행
- **파이프라인**: Python (google-genai, openai, moviepy 2.x, gtts)

## 참고

- 자막 폰트는 프로젝트 루트의 `NanumGothic.ttf`를 우선 사용하고, 없으면 Windows 맑은 고딕 → Linux 나눔고딕 순으로 폴백합니다.
- 상세한 개발 이력과 주의사항은 [CLAUDE.md](CLAUDE.md)를 참고하세요.
