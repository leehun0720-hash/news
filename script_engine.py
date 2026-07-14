import os
import json
import asyncio
from google import genai
from google.genai import types
from dotenv import load_dotenv

# 환경변수 로드 (.env 파일에서 API 키를 가져옵니다)
load_dotenv()

async def generate_video_script(news_text: str) -> dict:
    """
    뉴스 기사 텍스트를 입력받아 영상 렌더링을 위한 JSON 대본(딕셔너리)을 비동기로 반환합니다.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("[Error] GEMINI_API_KEY가 환경 변수에 설정되지 않았습니다.")

    client = genai.Client(api_key=api_key)

    prompt = f"""
당신은 영상 제작을 위한 전문 대본 작성자입니다.
아래 뉴스 기사를 바탕으로 짧은 영상(쇼츠/릴스) 제작을 위한 대본을 작성해 주세요.
결과는 반드시 아래 JSON 구조로만 반환해야 합니다.

[뉴스 기사]
{news_text}

[JSON 출력 구조]
{{
  "title": "영상의 메인 제목",
  "scenes": [
    {{
      "slide_number": 1,
      "narration": "TTS가 읽을 한글 나레이션 대본 (한 문장~두 문장)",
      "caption": "화면에 표시될 핵심 요약 자막 (짧게)",
      "search_keyword": "Pexels에서 배경 영상을 찾기 위한 영문 검색어 (예: stock market, office work)"
    }}
  ]
}}
"""
    try:
        # 비동기 모델 호출
        response = await client.aio.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        
        # JSON 문자열을 Python Dictionary로 파싱
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        script_data = json.loads(text)
        return script_data
        
    except json.JSONDecodeError as e:
        print(f"[Error] 모델 응답 JSON 파싱 실패: {e}\nRaw Response: {text}")
        return {"error": "json_parse_error", "message": str(e)}
    except Exception as e:
        print(f"[Error] Gemini API 호출 실패: {e}")
        return {"error": "api_call_error", "message": str(e)}

# 모듈 단독 실행 테스트를 위한 동기(Sync) 래퍼 함수
def run_sync_generate(news_text: str) -> dict:
    return asyncio.run(generate_video_script(news_text))

if __name__ == "__main__":
    sample_news = "한국은행이 기준금리를 3.50%로 13차례 연속 동결했다. 물가 상승률이 둔화하고 있지만, 가계부채 증가와 부동산 시장 과열 우려가 여전하기 때문이다."
    result = run_sync_generate(sample_news)
    print(json.dumps(result, indent=2, ensure_ascii=False))
