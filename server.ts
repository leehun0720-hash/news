import express from "express";
import path from "path";
import { spawn } from "child_process";
import fs from "fs";

let currentJob: any = {
  status: "idle", // 'idle', 'running', 'completed', 'error'
  result: null,
  error: null,
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  // 패키징된 앱에서는 설치 폴더가 아닌 쓰기 가능한 데이터 폴더에서 작업
  const workDir = process.env.APP_DATA_DIR || process.cwd();
  fs.mkdirSync(workDir, { recursive: true });
  app.use(express.json());

  // Serve the output directory statically so the frontend can play the video
  app.use("/output", express.static(path.join(workDir, "output")));

  app.get("/api/status", (req, res) => {
    res.json(currentJob);
  });

  // 작업 상태 초기화 (다운로드 완료 후 또는 수동 리셋)
  app.post("/api/reset", (req, res) => {
    if (currentJob.status === "running") {
      return res.status(400).json({ error: "파이프라인 실행 중에는 초기화할 수 없습니다." });
    }
    currentJob = { status: "idle", result: null, error: null };
    res.json({ success: true });
  });

  // API 키 연결 상태 확인 (각 서비스에 가벼운 인증 요청을 보내 검증)
  app.post("/api/check-keys", async (req, res) => {
    const body = req.body || {};
    const keys = {
      gemini: body.gemini_key || process.env.GEMINI_API_KEY || "",
      openai: body.openai_key || process.env.OPENAI_API_KEY || "",
      pexels: body.pexels_key || process.env.PEXELS_API_KEY || "",
    };

    const check = async (
      key: string,
      fn: () => Promise<Response>
    ): Promise<{ status: string; message: string }> => {
      if (!key) return { status: "missing", message: "키가 입력되지 않았습니다." };
      try {
        const r = await fn();
        if (r.ok) return { status: "ok", message: "연결됨" };
        // Gemini는 잘못된 키에 400(API_KEY_INVALID)을 반환
        if (r.status === 400 || r.status === 401 || r.status === 403)
          return { status: "fail", message: "인증 실패 — 키가 올바르지 않습니다." };
        return { status: "fail", message: `HTTP ${r.status} 오류` };
      } catch (e: any) {
        return { status: "fail", message: e.name === "TimeoutError" ? "응답 시간 초과" : "네트워크 오류" };
      }
    };

    const [gemini, openai, pexels] = await Promise.all([
      check(keys.gemini, () =>
        fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
          headers: { "x-goog-api-key": keys.gemini },
          signal: AbortSignal.timeout(8000),
        })
      ),
      check(keys.openai, () =>
        fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${keys.openai}` },
          signal: AbortSignal.timeout(8000),
        })
      ),
      check(keys.pexels, () =>
        fetch("https://api.pexels.com/videos/search?query=nature&per_page=1", {
          headers: { Authorization: keys.pexels },
          signal: AbortSignal.timeout(8000),
        })
      ),
    ]);

    res.json({ gemini, openai, pexels });
  });

  app.post("/api/generate", async (req, res) => {
    const { news_text, openai_key, pexels_key, gemini_key } = req.body;
    if (!news_text) {
      return res.status(400).json({ error: "news_text is required" });
    }

    if (currentJob.status === "running") {
      return res.status(400).json({ error: "이미 파이프라인이 실행 중입니다." });
    }

    currentJob = { status: "running", result: null, error: null };

    // Prepare environment variables for the Python script
    const env = {
      ...process.env,
      OPENAI_API_KEY: openai_key || process.env.OPENAI_API_KEY || "",
      PEXELS_API_KEY: pexels_key || process.env.PEXELS_API_KEY || "",
      GEMINI_API_KEY: gemini_key || process.env.GEMINI_API_KEY || "",
      // Windows 기본 인코딩(cp949)에서 한글 로그 출력이 깨지거나 실패하는 것을 방지
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
    };
    
    console.log("Starting Python pipeline...");
    // 패키징된 앱은 PyInstaller로 빌드된 pipeline.exe를, 개발 환경은 venv Python을 사용
    let pythonProcess;
    if (process.env.PIPELINE_EXE && fs.existsSync(process.env.PIPELINE_EXE)) {
      pythonProcess = spawn(process.env.PIPELINE_EXE, [], { env, cwd: workDir });
    } else {
      const venvPython =
        process.platform === "win32"
          ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
          : path.join(process.cwd(), ".venv", "bin", "python");
      const pythonCmd = fs.existsSync(venvPython)
        ? venvPython
        : process.platform === "win32"
          ? "python"
          : "python3";
      pythonProcess = spawn(pythonCmd, [path.join(process.cwd(), "pipeline.py")], { env, cwd: workDir });
    }
    
    // Return immediately to prevent 503 timeout
    res.json({ success: true, message: "Pipeline started" });
    
    let output = "";
    let errorOutput = "";
    
    // Send input via stdin
    pythonProcess.stdin.write(JSON.stringify({ news_text }) + "\n");
    pythonProcess.stdin.end();
    
    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
      console.log(`[Python stdout]: ${data}`);
    });
    
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
      console.error(`[Python stderr]: ${data}`);
    });
    
    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        const detail = errorOutput.trim().split("\n").slice(-3).join("\n");
        currentJob = { status: "error", error: `Pipeline failed: ${detail}`, details: errorOutput };
        return;
      }
      try {
        const resultLines = output.split('\n');
        let resultJsonStr = "";
        for (let i = resultLines.length - 1; i >= 0; i--) {
          if (resultLines[i].startsWith('RESULT:')) {
            resultJsonStr = resultLines[i].replace('RESULT:', '');
            break;
          }
        }
        if (resultJsonStr) {
          const result = JSON.parse(resultJsonStr);
          currentJob = { status: "completed", result };
        } else {
          currentJob = { status: "error", error: "Pipeline completed but no JSON result found." };
        }
      } catch (err) {
        currentJob = { status: "error", error: "Failed to parse pipeline output" };
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    // 프로덕션 번들에 vite가 포함되지 않도록 동적 import
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // 빌드 시 server.cjs와 프런트엔드 정적 파일이 같은 dist/ 폴더에 위치
    const distPath = process.env.STATIC_DIR || __dirname;
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
