# pip install requests openai python-dotenv

import os
import asyncio
import requests
from openai import AsyncOpenAI
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

# 에셋 저장 폴더 초기화
os.makedirs("assets/videos", exist_ok=True)
os.makedirs("assets/audios", exist_ok=True)

async def download_pexels_video(keyword: str, slide_number: int) -> str:
    """
    Pexels API를 호출하여 검색어(keyword)에 맞는 영상을 다운로드합니다.
    (MVP 수준에서 동기 requests 모듈을 비동기 스레드 풀에서 실행)
    """
    file_path = f"assets/videos/slide_{slide_number}.mp4"
    
    def _download():
        api_key = os.getenv("PEXELS_API_KEY")
        if not api_key:
            raise ValueError("PEXELS_API_KEY가 설정되지 않았습니다.")
            
        headers = {"Authorization": api_key}
        # 쇼츠/릴스용 영상이 필요할 경우 orientation="portrait"으로 변경 가능
        params = {"query": keyword, "per_page": 1, "orientation": "landscape"}
        
        # Pexels 검색 API 호출
        response = requests.get("https://api.pexels.com/videos/search", headers=headers, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        if not data.get("videos"):
            raise ValueError(f"'{keyword}'에 대한 검색 결과가 없습니다.")
            
        video_files = data["videos"][0].get("video_files", [])
        if not video_files:
            raise ValueError("비디오 파일 링크를 찾을 수 없습니다.")
            
        # 가급적 HD 화질 우선 선택
        hd_file = next((f for f in video_files if f.get("quality") == "hd"), None)
        target_url = hd_file["link"] if hd_file else video_files[0]["link"]
        
        # 실제 영상 파일 다운로드
        vid_resp = requests.get(target_url, stream=True, timeout=30)
        vid_resp.raise_for_status()
        
        with open(file_path, "wb") as f:
            for chunk in vid_resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    
    try:
        await asyncio.to_thread(_download)
        print(f"[Success] 비디오 다운로드 완료: {file_path}")
    except Exception as e:
        print(f"[Error] Pexels 다운로드 실패 (Slide {slide_number}): {e}")
        # 실패 시 Fallback: 빈 파일 생성 (파이프라인 중단 방지)
        with open(file_path, "wb") as f:
            pass
            
    return file_path


async def generate_tts_audio(text: str, slide_number: int) -> str:
    """
    OpenAI API를 활용하여 텍스트를 음성(TTS)으로 변환합니다. 실패시 gTTS로 대체합니다.
    """
    file_path = f"assets/audios/slide_{slide_number}.mp3"
    
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")
            
        client = AsyncOpenAI(api_key=api_key)
        
        # OpenAI TTS 호출
        response = await client.audio.speech.create(
            model="tts-1",
            voice="alloy",  # alloy, echo, fable, onyx, nova, shimmer
            input=text
        )
        
        # 파일 저장 로직 (blocking I/O 분리)
        def _save_audio():
            response.write_to_file(file_path)
            
        await asyncio.to_thread(_save_audio)
        print(f"[Success] TTS 오디오 생성 완료: {file_path}")
        
    except Exception as e:
        # print(f"[Warning] OpenAI TTS 실패 (Slide {slide_number}): {e}. Fallback to gTTS...")
        try:
            from gtts import gTTS
            def _save_gtts():
                tts = gTTS(text=text, lang='ko')
                tts.save(file_path)
            await asyncio.to_thread(_save_gtts)
            print(f"[Success] gTTS 오디오 생성 완료: {file_path}")
        except Exception as ex:
            print(f"[Error] gTTS 생성 실패 (Slide {slide_number}): {ex}")
            # 실패 시 Fallback: 빈 파일 생성 (파이프라인 중단 방지)
            with open(file_path, "wb") as f:
                pass
                
    return file_path


# 개별 모듈 테스트를 위한 엔트리포인트
async def _test_main():
    print(">>> 테스트 실행 중...")
    await asyncio.gather(
        download_pexels_video("office work", 1),
        generate_tts_audio("안녕하세요. 오늘 날씨는 매우 맑습니다.", 1)
    )
    print(">>> 테스트 완료")

if __name__ == "__main__":
    asyncio.run(_test_main())
