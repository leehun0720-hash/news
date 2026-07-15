import sys
import json
import asyncio
from script_engine import generate_video_script
from asset_manager import download_pexels_video, generate_tts_audio

async def main():
    # Read input from stdin
    input_data = sys.stdin.read()
    if not input_data:
        print(json.dumps({"error": "No input provided"}))
        sys.exit(1)
        
    try:
        data = json.loads(input_data)
        news_text = data.get("news_text", "")
    except Exception as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    print(f"[Info] Generating script for news: {news_text[:30]}...")
    
    # 1. Generate Script
    script_result = await generate_video_script(news_text)
    
    if "error" in script_result:
        print("RESULT:" + json.dumps({"status": "error", "message": script_result}))
        sys.exit(1)
        
    scenes = script_result.get("scenes", [])
    
    # 2. Download Assets for each scene concurrently
    tasks = []
    for scene in scenes:
        slide_num = scene.get("slide_number")
        keyword = scene.get("search_keyword", "nature")
        narration = scene.get("narration", "")
        
        # Add Pexels download task
        tasks.append(download_pexels_video(keyword, slide_num))
        # Add TTS task
        if narration:
            tasks.append(generate_tts_audio(narration, slide_num))
            
    # Run all asset downloads concurrently
    print(f"[Info] Downloading assets for {len(scenes)} scenes...")
    await asyncio.gather(*tasks)
    
    # 3. Render Final Video
    video_path = None
    try:
        from video_composer import render_final_video
        print("[Info] Rendering final video...")
        # MoviePy 렌더링은 동기 작업이므로 별도 스레드에서 실행
        video_path = await asyncio.to_thread(render_final_video, script_result)
    except ImportError:
        print("[Warning] moviepy 모듈을 찾을 수 없어 영상 합성을 건너뜁니다.")
    except Exception as e:
        print(f"[Error] 영상 렌더링 중 오류 발생: {e}")
        
    print("[Info] Pipeline completed successfully!")
    
    # Output the final script result in a specific format to be parsed by Node
    print("RESULT:" + json.dumps({
        "status": "success",
        "script": script_result,
        "video_path": video_path
    }))

def selftest():
    """패키징 검증용: 모든 핵심 의존성이 로드되는지 확인"""
    import moviepy
    import video_composer
    from google import genai
    import openai
    import gtts
    import imageio_ffmpeg
    print(f"SELFTEST_OK moviepy={moviepy.__version__} ffmpeg={imageio_ffmpeg.get_ffmpeg_exe()} font={video_composer.FONT_PATH}")

if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        asyncio.run(main())
