// NEWSCUT 데스크톱 앱 진입점 — 내장 Express 서버를 띄우고 창에 로드
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");

// 사용 가능한 포트를 찾음 (다른 앱과의 충돌 방지)
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function main() {
  await app.whenReady();

  // 쓰기 가능한 작업 폴더 (%APPDATA%/NEWSCUT/work) — 영상/에셋이 여기에 생성됨
  const workDir = path.join(app.getPath("userData"), "work");
  fs.mkdirSync(workDir, { recursive: true });

  const port = await getFreePort();
  process.env.NODE_ENV = "production";
  process.env.PORT = String(port);
  process.env.APP_DATA_DIR = workDir;
  process.env.PIPELINE_EXE = path.join(process.resourcesPath, "pipeline", "pipeline.exe");

  // 번들된 Express 서버 시작 (dist/server.cjs — 프런트엔드 정적 파일과 같은 폴더)
  require(path.join(__dirname, "..", "dist", "server.cjs"));

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    autoHideMenuBar: true,
    backgroundColor: "#0a0a11",
    title: "NEWSCUT",
  });

  // 서버가 리슨할 때까지 짧게 재시도하며 로드
  const url = `http://127.0.0.1:${port}`;
  const tryLoad = (attempt) => {
    win.loadURL(url).catch(() => {
      if (attempt < 20) setTimeout(() => tryLoad(attempt + 1), 300);
    });
  };
  tryLoad(0);
}

app.on("window-all-closed", () => app.quit());
main();
