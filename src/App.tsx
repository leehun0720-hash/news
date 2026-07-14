import React, { useState, useEffect } from 'react';
import { Settings, Play, Key, FileText, CheckCircle2, Loader2, XCircle, MinusCircle, RotateCcw, Wifi, Sparkles, Clapperboard } from 'lucide-react';

// API 연결 상태 한 줄 표시 (ok / fail / missing)
function StatusRow({ label, desc, info }: { label: string; desc: string; info: any }) {
  const status = info?.status;
  const icon =
    status === 'ok' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
    status === 'fail' ? <XCircle className="w-5 h-5 text-red-400" /> :
    <MinusCircle className="w-5 h-5 text-gray-600" />;
  const textColor =
    status === 'ok' ? 'text-emerald-400' :
    status === 'fail' ? 'text-red-400' :
    'text-gray-500';

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-white/[0.04] rounded-xl border border-white/5">
      <div>
        <p className="text-sm font-medium text-gray-100">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      <div className={`flex items-center gap-2 text-sm font-medium ${textColor}`}>
        {icon}
        {info?.message || '확인 전'}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'settings'>('pipeline');

  // Settings State
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [pexelsKey, setPexelsKey] = useState('');

  // Pipeline State
  const [newsText, setNewsText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // API Key Check State
  const [keyStatus, setKeyStatus] = useState<any>(null);
  const [isCheckingKeys, setIsCheckingKeys] = useState(false);

  useEffect(() => {
    // Load keys from localStorage on mount
    setGeminiKey(localStorage.getItem('GEMINI_API_KEY') || '');
    setOpenaiKey(localStorage.getItem('OPENAI_API_KEY') || '');
    setPexelsKey(localStorage.getItem('PEXELS_API_KEY') || '');
  }, []);

  const saveSettings = () => {
    localStorage.setItem('GEMINI_API_KEY', geminiKey);
    localStorage.setItem('OPENAI_API_KEY', openaiKey);
    localStorage.setItem('PEXELS_API_KEY', pexelsKey);
    alert('설정이 저장되었습니다.');
  };

  // 화면과 서버 작업 상태를 초기 상태로 되돌림
  const resetAll = async (keepNotice = false) => {
    setNewsText('');
    setResult(null);
    setError('');
    setIsGenerating(false);
    if (!keepNotice) setNotice('');
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch {
      // 서버 리셋 실패는 치명적이지 않으므로 무시
    }
  };

  // 완성된 영상 파일을 브라우저 다운로드로 저장
  const downloadVideo = async (videoPath: string) => {
    const res = await fetch(`/${videoPath}`);
    if (!res.ok) throw new Error('영상 파일을 가져오지 못했습니다.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `news_video_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // 각 API 키의 연결 상태 확인
  const checkConnections = async () => {
    setIsCheckingKeys(true);
    setKeyStatus(null);
    try {
      const res = await fetch('/api/check-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_key: geminiKey, openai_key: openaiKey, pexels_key: pexelsKey }),
      });
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      setKeyStatus(await res.json());
    } catch (err: any) {
      setKeyStatus({ _error: err.message || '연결 확인 중 오류가 발생했습니다.' });
    } finally {
      setIsCheckingKeys(false);
    }
  };

  const handleGenerate = async () => {
    if (!newsText.trim()) {
      setError('뉴스 기사를 입력해주세요.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setNotice('');
    setResult(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_text: newsText,
          gemini_key: geminiKey,
          openai_key: openaiKey,
          pexels_key: pexelsKey
        })
      });

      let data;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`서버 응답 오류 (${response.status}): ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || '파이프라인 실행 중 오류가 발생했습니다.');
      }

      // Start polling status
      const pollStatus = async () => {
        try {
          const statusRes = await fetch('/api/status');
          const statusData = await statusRes.json();

          if (statusData.status === 'completed') {
            setResult(statusData.result);
            setIsGenerating(false);

            // 영상이 생성되었으면 자동 다운로드 후 화면 초기화
            const videoPath = statusData.result?.video_path;
            if (videoPath) {
              try {
                await downloadVideo(videoPath);
                setNotice('영상이 자동으로 다운로드되었습니다. 새 작업을 시작할 수 있도록 화면을 초기화했습니다.');
                await resetAll(true);
              } catch (err: any) {
                setError(`자동 다운로드 실패: ${err.message}`);
              }
            }
          } else if (statusData.status === 'error') {
            setError(statusData.error || '파이프라인 처리 중 오류가 발생했습니다.');
            setIsGenerating(false);
          } else {
            setTimeout(pollStatus, 3000);
          }
        } catch (err: any) {
          setError(err.message || '상태 확인 중 오류가 발생했습니다.');
          setIsGenerating(false);
        }
      };
      setTimeout(pollStatus, 3000);

    } catch (err: any) {
      setError(err.message);
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a11] text-gray-100 font-sans relative">
      {/* 배경 글로우 장식 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-purple-600/15 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -left-40 w-[500px] h-[400px] bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 -right-40 w-[500px] h-[400px] bg-pink-600/10 rounded-full blur-[120px]" />
      </div>

      <header className="bg-[#0a0a11]/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Clapperboard className="w-4.5 h-4.5 text-white" />
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-white">
              NEWS<span className="bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">CUT</span>
            </h1>
          </div>
          <nav className="flex gap-1 bg-white/[0.04] border border-white/5 rounded-full p-1">
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeTab === 'pipeline'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-purple-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                영상 만들기
              </div>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-purple-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                설정
              </div>
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        {activeTab === 'settings' ? (
          <div className="bg-white/[0.03] p-6 rounded-2xl border border-white/10 backdrop-blur-sm max-w-2xl mx-auto">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">
              <Key className="w-5 h-5 text-purple-400" />
              API 키 설정
            </h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Gemini API Key</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AI Studio에서 발급받은 키를 입력하세요"
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-gray-100 placeholder-gray-600 focus:ring-2 focus:ring-purple-500/60 focus:border-purple-500/60 outline-none transition-shadow"
                />
                <p className="text-xs text-gray-500 mt-1.5">대본 생성을 위한 Gemini 모델 호출에 사용됩니다.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">OpenAI API Key</label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-gray-100 placeholder-gray-600 focus:ring-2 focus:ring-purple-500/60 focus:border-purple-500/60 outline-none transition-shadow"
                />
                <p className="text-xs text-gray-500 mt-1.5">나레이션(TTS) 음성 생성에 사용됩니다.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Pexels API Key</label>
                <input
                  type="password"
                  value={pexelsKey}
                  onChange={(e) => setPexelsKey(e.target.value)}
                  placeholder="Pexels 비디오 API 키를 입력하세요"
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-gray-100 placeholder-gray-600 focus:ring-2 focus:ring-purple-500/60 focus:border-purple-500/60 outline-none transition-shadow"
                />
                <p className="text-xs text-gray-500 mt-1.5">배경 영상(B-Roll) 다운로드에 사용됩니다.</p>
              </div>

              <div className="pt-4 border-t border-white/5">
                <button
                  onClick={saveSettings}
                  className="w-full bg-white text-gray-900 hover:bg-gray-200 font-semibold py-2.5 rounded-xl transition-colors"
                >
                  설정 저장하기
                </button>
              </div>

              {/* API 연결 상태 확인 */}
              <div className="pt-6 border-t border-white/5">
                <h3 className="text-base font-semibold mb-4 flex items-center gap-2 text-white">
                  <Wifi className="w-4 h-4 text-purple-400" />
                  API 연결 상태
                </h3>
                <button
                  onClick={checkConnections}
                  disabled={isCheckingKeys}
                  className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-opacity flex items-center justify-center gap-2 mb-4 shadow-lg shadow-purple-500/25"
                >
                  {isCheckingKeys ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      확인 중...
                    </>
                  ) : (
                    '연결 상태 확인하기'
                  )}
                </button>

                {keyStatus?._error ? (
                  <div className="p-4 bg-red-500/10 text-red-300 text-sm rounded-xl border border-red-500/30">
                    {keyStatus._error}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <StatusRow label="Gemini" desc="대본 생성 (필수)" info={keyStatus?.gemini} />
                    <StatusRow label="Pexels" desc="배경 영상 다운로드 (필수)" info={keyStatus?.pexels} />
                    <StatusRow label="OpenAI" desc="TTS 음성 (선택 — 없으면 gTTS 사용)" info={keyStatus?.openai} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 히어로 */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300 text-sm font-medium mb-6">
                <Sparkles className="w-3.5 h-3.5" />
                # AI 뉴스 영상 자동 생성
              </div>
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight text-white">
                뉴스 기사 한 편이
                <br />
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  완성된 쇼츠 영상으로
                </span>
              </h2>
              <p className="mt-5 text-gray-400 text-base sm:text-lg">
                기사를 붙여넣기만 하면 대본 작성, 배경 영상, 나레이션, 자막까지 자동으로 완성됩니다.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Input Column */}
              <div className="space-y-6">
                <div className="bg-white/[0.03] p-6 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <h2 className="text-lg font-semibold mb-4 text-white">뉴스 기사 입력</h2>
                  <textarea
                    value={newsText}
                    onChange={(e) => setNewsText(e.target.value)}
                    placeholder="영상으로 변환할 뉴스 기사 본문을 여기에 붙여넣으세요..."
                    className="w-full h-64 p-4 bg-black/40 border border-white/10 rounded-xl text-gray-100 placeholder-gray-600 focus:ring-2 focus:ring-purple-500/60 focus:border-purple-500/60 outline-none resize-none transition-shadow text-sm leading-relaxed"
                  />
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="flex-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          파이프라인 실행 중...
                        </>
                      ) : (
                        <>
                          <Play className="w-5 h-5" />
                          쇼츠로 변환하기
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => resetAll()}
                      disabled={isGenerating}
                      title="입력과 결과를 모두 초기화"
                      className="px-4 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-gray-300 font-medium py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 border border-white/10"
                    >
                      <RotateCcw className="w-5 h-5" />
                      초기화
                    </button>
                  </div>

                  {error && (
                    <div className="mt-4 p-4 bg-red-500/10 text-red-300 text-sm rounded-xl border border-red-500/30">
                      {error}
                    </div>
                  )}

                  {notice && (
                    <div className="mt-4 p-4 bg-emerald-500/10 text-emerald-300 text-sm rounded-xl border border-emerald-500/30 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      {notice}
                    </div>
                  )}
                </div>
              </div>

              {/* Output Column */}
              <div className="space-y-6">
                <div className="bg-white/[0.03] p-6 rounded-2xl border border-white/10 backdrop-blur-sm min-h-[400px]">
                  <h2 className="text-lg font-semibold mb-4 flex items-center justify-between text-white">
                    결과 확인
                    {result && <span className="flex items-center gap-1 text-sm text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/25 px-2 py-1 rounded-lg"><CheckCircle2 className="w-4 h-4"/> 완료</span>}
                  </h2>

                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 border border-purple-500/25 flex items-center justify-center">
                        <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
                      </div>
                      <p className="text-sm">AI가 대본을 작성하고 영상을 합성하는 중입니다...</p>
                    </div>
                  ) : result?.script ? (
                    <div className="space-y-6">
                      {result.video_path && (
                        <div className="bg-black rounded-xl overflow-hidden shadow-2xl shadow-purple-500/10 border border-white/10">
                          <video
                            src={`/${result.video_path}`}
                            controls
                            className="w-full h-auto max-h-[400px]"
                            autoPlay
                          />
                        </div>
                      )}

                      <div className="pb-4 border-b border-white/5 mt-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">영상 제목</h3>
                        <p className="text-lg font-semibold text-white">{result.script.title}</p>
                      </div>

                      <div className="space-y-4">
                        {result.script.scenes.map((scene: any, idx: number) => (
                          <div key={idx} className="bg-white/[0.04] p-4 rounded-xl border border-white/5">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold bg-gradient-to-r from-indigo-500/30 to-purple-500/30 border border-purple-500/25 text-purple-200 px-2.5 py-1 rounded-lg">Scene {scene.slide_number}</span>
                              <span className="text-xs text-gray-500 font-mono">{scene.search_keyword}</span>
                            </div>
                            <div className="space-y-2 mt-3">
                              <div>
                                <span className="text-xs text-gray-500 font-semibold uppercase">자막 (Caption)</span>
                                <p className="text-sm font-medium text-gray-100 mt-1">{scene.caption}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 font-semibold uppercase">나레이션 (TTS)</span>
                                <p className="text-sm text-gray-400 mt-1">{scene.narration}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-sm rounded-xl flex items-center justify-between">
                        <span>{result.video_path ? '최종 영상이 생성되어 화면에서 재생 가능합니다!' : '모든 에셋(mp4, mp3)이 서버의 assets/ 폴더에 저장되었습니다.'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-600">
                      <FileText className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm text-center text-gray-500">기사를 입력하고 실행 버튼을 누르면<br/>이곳에 생성된 대본과 결과가 표시됩니다.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
