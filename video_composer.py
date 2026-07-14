# pip install moviepy  (2.x — TextClip이 Pillow 기반이라 ImageMagick 불필요)

import os
from moviepy import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, concatenate_videoclips

# 최종 결과물 저장 폴더 초기화
os.makedirs("output", exist_ok=True)

def _pick_korean_font() -> str:
    """사용 가능한 첫 번째 유효한 한글 폰트 파일 경로를 반환합니다."""
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "NanumGothic.ttf"),
        r"C:\Windows\Fonts\malgun.ttf",       # 맑은 고딕 (Windows 기본)
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",  # Linux
    ]
    from PIL import ImageFont
    for path in candidates:
        if os.path.exists(path):
            try:
                ImageFont.truetype(path, 20)
                return path
            except Exception:
                print(f"[Warning] 폰트 파일이 손상되어 건너뜁니다: {path}")
    raise RuntimeError("사용 가능한 한글 폰트를 찾을 수 없습니다.")

FONT_PATH = _pick_korean_font()

def render_final_video(script_json: dict) -> str:
    """
    다운로드된 영상과 음성 에셋, JSON 대본을 바탕으로 최종 영상을 합성합니다.
    """
    scenes = script_json.get("scenes", [])
    if not scenes:
        raise ValueError("합성할 씬 데이터가 없습니다.")

    final_clips = []

    for scene in scenes:
        slide_num = scene.get("slide_number")
        caption_text = scene.get("caption", "")

        video_path = f"assets/videos/slide_{slide_num}.mp4"
        audio_path = f"assets/audios/slide_{slide_num}.mp3"

        # 파일 존재 여부 및 크기 확인
        if not os.path.exists(video_path) or os.path.getsize(video_path) == 0:
            print(f"[Warning] Slide {slide_num} 비디오 에셋을 찾을 수 없거나 비어 있어 건너뜁니다.")
            continue

        has_audio = os.path.exists(audio_path) and os.path.getsize(audio_path) > 0

        try:
            video_clip = VideoFileClip(video_path)

            if has_audio:
                # 1. 오디오 클립 로드
                audio_clip = AudioFileClip(audio_path)
                audio_duration = audio_clip.duration

                # 2. 비디오 길이를 오디오 길이에 맞춤 (자르기)
                if video_clip.duration > audio_duration:
                    video_clip = video_clip.subclipped(0, audio_duration)

                # 3. 비디오에 오디오 덧씌우기 (비디오가 더 짧으면 오디오를 비디오 길이에 맞춤)
                if audio_clip.duration > video_clip.duration:
                    audio_clip = audio_clip.subclipped(0, video_clip.duration)
                video_clip = video_clip.with_audio(audio_clip)
            else:
                # 오디오가 없으면 기본 비디오 길이 사용 (최대 5초로 제한)
                if video_clip.duration > 5:
                    video_clip = video_clip.subclipped(0, 5)

            # 4. 자막 생성 (TextClip) — 반투명 검정 배경(#00000080)
            txt_clip = TextClip(
                font=FONT_PATH,
                text=caption_text,
                font_size=50,
                color='white',
                bg_color='#00000080',
                method='caption',
                size=(int(video_clip.w * 0.8), None)  # 가로 너비 제한 (화면의 80%)
            )

            # 자막 위치(중앙 하단) 및 길이 설정
            txt_clip = txt_clip.with_position(('center', 'bottom')).with_duration(video_clip.duration)

            # 5. 비디오와 자막 합성
            composite_clip = CompositeVideoClip([video_clip, txt_clip])
            final_clips.append(composite_clip)

            print(f"[Info] Slide {slide_num} 클립 합성 준비 완료")

        except Exception as e:
            print(f"[Error] Slide {slide_num} 클립 생성 중 오류 발생: {e}")
            continue

    if not final_clips:
        raise RuntimeError("합성 가능한 유효한 슬라이드가 없습니다.")

    # 6. 전체 클립 이어붙이기 (compose 메서드로 해상도 차이 등 방어)
    final_video = concatenate_videoclips(final_clips, method="compose")

    # 7. 최종 파일 렌더링
    output_path = "output/final_news.mp4"
    print(f"[Info] 렌더링 시작: {output_path}")
    final_video.write_videofile(
        output_path,
        fps=24,
        codec="libx264",
        audio_codec="aac",
        preset="ultrafast",
        threads=4
    )

    # 리소스 해제
    final_video.close()
    for clip in final_clips:
        clip.close()

    print("[Success] 최종 영상 합성 및 렌더링 완료!")
    return output_path

if __name__ == "__main__":
    # 테스트용 JSON 페이로드 (실제 환경에서는 pipeline.py에서 넘어옴)
    sample_json = {
        "title": "테스트 뉴스 영상",
        "scenes": [
            {
                "slide_number": 1,
                "caption": "테스트 자막입니다."
            }
        ]
    }
    # render_final_video(sample_json)
