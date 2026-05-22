const http = require('node:http');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'db.json');
const DB_EXAMPLE_FILE = path.join(DATA_DIR, 'db.example.json');
const MAX_BODY_BYTES = 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!fss.existsSync(DB_FILE)) {
    const seed = fss.existsSync(DB_EXAMPLE_FILE)
      ? await fs.readFile(DB_EXAMPLE_FILE, 'utf8')
      : '{"surveys":[],"responses":[]}';
    await fs.writeFile(DB_FILE, seed, 'utf8');
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, 'utf8');
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, '') || '{}');
  return {
    surveys: Array.isArray(parsed.surveys) ? parsed.surveys : [],
    responses: Array.isArray(parsed.responses) ? parsed.responses : []
  };
}

async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmp, DB_FILE);
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
}

function sendJson(res, status, body) {
  send(res, status, body, { 'content-type': 'application/json; charset=utf-8' });
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON 格式不正确'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function normalizeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function validateQuestions(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw Object.assign(new Error('至少需要 1 个问题'), { status: 400 });
  }

  return input.map((question, index) => {
    const type = normalizeText(question.type, 'short');
    const allowedTypes = new Set(['short', 'textarea', 'single', 'multiple', 'rating']);
    if (!allowedTypes.has(type)) {
      throw Object.assign(new Error(`第 ${index + 1} 题类型不支持`), { status: 400 });
    }

    const title = normalizeText(question.title);
    if (!title) {
      throw Object.assign(new Error(`第 ${index + 1} 题题目不能为空`), { status: 400 });
    }

    let options = Array.isArray(question.options)
      ? question.options.map(option => normalizeText(option)).filter(Boolean)
      : [];

    if ((type === 'single' || type === 'multiple') && options.length < 2) {
      throw Object.assign(new Error(`第 ${index + 1} 题至少需要 2 个选项`), { status: 400 });
    }

    if (type === 'rating') {
      options = ['1', '2', '3', '4', '5'];
    }

    return {
      id: question.id || randomUUID(),
      type,
      title,
      required: Boolean(question.required),
      options
    };
  });
}

function validateSurveyPayload(payload) {
  const title = normalizeText(payload.title);
  if (!title) {
    throw Object.assign(new Error('问卷标题不能为空'), { status: 400 });
  }

  return {
    title,
    description: normalizeText(payload.description),
    status: payload.status === 'draft' ? 'draft' : 'published',
    questions: validateQuestions(payload.questions)
  };
}

function normalizeAnswerValue(question, value) {
  if (question.type === 'multiple') {
    const values = Array.isArray(value) ? value.map(item => normalizeText(item)).filter(Boolean) : [];
    if (question.required && values.length === 0) {
      throw Object.assign(new Error(`必填题未填写：${question.title}`), { status: 400 });
    }
    return values;
  }

  const text = normalizeText(value);
  if (question.required && !text) {
    throw Object.assign(new Error(`必填题未填写：${question.title}`), { status: 400 });
  }
  return text;
}

function validateResponsePayload(survey, payload) {
  const answers = payload.answers || {};
  if (typeof answers !== 'object' || Array.isArray(answers)) {
    throw Object.assign(new Error('答案格式不正确'), { status: 400 });
  }

  return survey.questions.reduce((acc, question) => {
    acc[question.id] = normalizeAnswerValue(question, answers[question.id]);
    return acc;
  }, {});
}

function summarizeSurvey(survey, responseCount = 0) {
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    status: survey.status,
    questionCount: survey.questions.length,
    responseCount,
    createdAt: survey.createdAt,
    updatedAt: survey.updatedAt
  };
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function csvFileName(title) {
  const safe = title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `${safe || 'survey'}-responses.csv`;
}

function buildCsv(survey, responses) {
  const header = ['response_id', 'submitted_at', ...survey.questions.map(q => q.title)];
  const lines = [header.map(csvEscape).join(',')];

  for (const response of responses) {
    const row = [
      response.id,
      response.submittedAt,
      ...survey.questions.map(question => response.answers?.[question.id] ?? '')
    ];
    lines.push(row.map(csvEscape).join(','));
  }

  return `\uFEFF${lines.join('\n')}`;
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, '禁止访问');
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME_TYPES[ext] || 'application/octet-stream',
      'cache-control': 'public, max-age=600'
    });
    res.end(data);
  } catch {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    const data = await fs.readFile(indexPath);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(data);
  }
}

async function handleApi(req, res, pathname) {
  const db = await readDb();
  const parts = pathname.split('/').filter(Boolean);
  const [, resource, id, action] = parts;

  if (resource !== 'surveys') {
    return sendError(res, 404, '接口不存在');
  }

  if (req.method === 'GET' && !id) {
    const counts = db.responses.reduce((acc, response) => {
      acc[response.surveyId] = (acc[response.surveyId] || 0) + 1;
      return acc;
    }, {});
    return sendJson(res, 200, db.surveys.map(survey => summarizeSurvey(survey, counts[survey.id] || 0)));
  }

  if (req.method === 'POST' && !id) {
    const payload = validateSurveyPayload(await parseJsonBody(req));
    const now = new Date().toISOString();
    const survey = {
      id: randomUUID(),
      ...payload,
      createdAt: now,
      updatedAt: now
    };
    db.surveys.unshift(survey);
    await writeDb(db);
    return sendJson(res, 201, survey);
  }

  const survey = db.surveys.find(item => item.id === id);
  if (!survey) {
    return sendError(res, 404, '问卷不存在');
  }

  if (req.method === 'GET' && !action) {
    const responseCount = db.responses.filter(response => response.surveyId === id).length;
    return sendJson(res, 200, { ...survey, responseCount });
  }

  if (req.method === 'PATCH' && !action) {
    const payload = await parseJsonBody(req);
    const current = { ...survey, ...payload };
    const normalized = validateSurveyPayload(current);
    Object.assign(survey, normalized, { updatedAt: new Date().toISOString() });
    await writeDb(db);
    return sendJson(res, 200, survey);
  }

  if (req.method === 'POST' && action === 'responses') {
    if (survey.status !== 'published') {
      return sendError(res, 403, '问卷尚未发布');
    }
    const answers = validateResponsePayload(survey, await parseJsonBody(req));
    const response = {
      id: randomUUID(),
      surveyId: survey.id,
      answers,
      submittedAt: new Date().toISOString()
    };
    db.responses.unshift(response);
    await writeDb(db);
    return sendJson(res, 201, response);
  }

  if (req.method === 'GET' && action === 'responses') {
    const responses = db.responses.filter(response => response.surveyId === id);
    return sendJson(res, 200, responses);
  }

  if (req.method === 'GET' && action === 'export.csv') {
    const responses = db.responses.filter(response => response.surveyId === id);
    const csv = buildCsv(survey, responses);
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="responses.csv"; filename*=UTF-8''${encodeURIComponent(csvFileName(survey.title))}`,
      'cache-control': 'no-store'
    });
    return res.end(csv);
  }

  return sendError(res, 404, '接口不存在');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url.pathname);
    }
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    const status = error.status || 500;
    const message = status === 500 ? '服务器内部错误' : error.message;
    if (status === 500) console.error(error);
    return sendError(res, status, message);
  }
});

ensureDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Questionnaire demo running at http://localhost:${PORT}`);
  });
});

