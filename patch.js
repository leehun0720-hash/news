import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `      if (data.result?.status === 'error') {
        const errorMsg = data.result.message?.message || JSON.stringify(data.result.message);
        throw new Error(\`파이프라인 오류: \${errorMsg}\`);
      }
      
      setResult(data.result);
    } catch (err: any) {`;

const replacement = `      // Start polling status
      const pollStatus = async () => {
        try {
          const statusRes = await fetch('/api/status');
          const statusData = await statusRes.json();
          
          if (statusData.status === 'completed') {
            setResult(statusData.result);
            setIsGenerating(false);
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

    } catch (err: any) {`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacement);
  fs.writeFileSync('src/App.tsx', code);
  console.log('Patched App.tsx successfully.');
} else {
  console.log('Target string not found in App.tsx');
}
