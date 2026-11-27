import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const python =
  process.env.STEWART_DOCS_PYTHON ||
  (process.platform === 'win32' ? 'python' : 'python3');
const result = spawnSync(
  python,
  [
    fileURLToPath(new URL('./build-manual.py', import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
if (result.error)
  console.error(
    '需要 Python 3 與 reportlab，可用 STEWART_DOCS_PYTHON 指定 Python 執行檔。',
    result.error.message,
  );
process.exitCode = result.status ?? 1;
