const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const port = 3917;
const base = `http://127.0.0.1:${port}`;
const dbFile = path.join(os.tmpdir(), `questionnaire-demo-${Date.now()}.json`);
const server = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(port), DB_FILE: dbFile },
  stdio: ['ignore', 'pipe', 'pipe']
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 8000);
    server.stdout.on('data', data => {
      if (String(data).includes(`http://localhost:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on('data', data => process.stderr.write(data));
    server.on('exit', code => reject(new Error(`server exited early: ${code}`)));
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    headers: { 'content-type': 'application/json' },
    ...options
  });
  const text = await response.text();
  const data = response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(data)}`);
  return data;
}

(async () => {
  await waitForServer();

  const survey = await request('/api/surveys', {
    method: 'POST',
    body: JSON.stringify({
      title: '培训满意度调查',
      description: 'API smoke test',
      questions: [
        { type: 'single', title: '课程是否有帮助？', required: true, options: ['是', '否'] },
        { type: 'multiple', title: '你喜欢哪些环节？', options: ['讲解', '案例', '练习'] },
        { type: 'rating', title: '整体评分', required: true }
      ]
    })
  });

  await request(`/api/surveys/${survey.id}/responses`, {
    method: 'POST',
    body: JSON.stringify({
      answers: {
        [survey.questions[0].id]: '是',
        [survey.questions[1].id]: ['讲解', '练习'],
        [survey.questions[2].id]: '5'
      }
    })
  });

  const responses = await request(`/api/surveys/${survey.id}/responses`);
  if (responses.length !== 1) throw new Error('response was not saved');

  const analysis = await request(`/api/surveys/${survey.id}/analysis`);
  if (analysis.overview.responseCount !== 1 || !analysis.questions.length) {
    throw new Error('analysis endpoint content mismatch');
  }

  const csv = await request(`/api/surveys/${survey.id}/export.csv`);
  if (!csv.includes('课程是否有帮助') || !csv.includes('讲解|练习')) {
    throw new Error('csv export content mismatch');
  }

  console.log('API smoke test passed');
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.kill();
    await fs.rm(dbFile, { force: true });
  });
