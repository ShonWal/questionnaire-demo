const state = {
  questions: [],
  surveys: [],
  activeSurvey: null,
  activeAnalysisSurveyId: null
};

const typeLabels = {
  short: '单行文本',
  textarea: '长文本',
  single: '单选题',
  multiple: '多选题',
  rating: '评分题'
};

const els = {
  tabs: document.querySelectorAll('.tab'),
  builderView: document.querySelector('#builderView'),
  dashboardView: document.querySelector('#dashboardView'),
  fillView: document.querySelector('#fillView'),
  surveyForm: document.querySelector('#surveyForm'),
  surveyTitle: document.querySelector('#surveyTitle'),
  surveyDescription: document.querySelector('#surveyDescription'),
  questions: document.querySelector('#questions'),
  previewTitle: document.querySelector('#previewTitle'),
  previewDescription: document.querySelector('#previewDescription'),
  previewQuestions: document.querySelector('#previewQuestions'),
  surveyList: document.querySelector('#surveyList'),
  surveyCount: document.querySelector('#surveyCount'),
  responseCount: document.querySelector('#responseCount'),
  responsesPanel: document.querySelector('#responsesPanel'),
  responsesTitle: document.querySelector('#responsesTitle'),
  responsesTable: document.querySelector('#responsesTable'),
  exportLink: document.querySelector('#exportLink'),
  analysisPanel: document.querySelector('#analysisPanel'),
  analysisTitle: document.querySelector('#analysisTitle'),
  analysisContent: document.querySelector('#analysisContent'),
  refreshAnalysis: document.querySelector('#refreshAnalysis'),
  fillEmpty: document.querySelector('#fillEmpty'),
  fillForm: document.querySelector('#fillForm'),
  toast: document.querySelector('#toast')
};

function uid() {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2400);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '0';
  document.body.appendChild(input);
  input.select();
  input.setSelectionRange(0, input.value.length);

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(input);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(data.error || data || '请求失败');
  }
  return data;
}

function setView(view) {
  els.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
  ['builder', 'dashboard', 'fill'].forEach(name => {
    els[`${name}View`].classList.toggle('active', name === view);
  });
}

function addQuestion(type = 'short') {
  const baseOptions = type === 'single' || type === 'multiple' ? ['选项 1', '选项 2'] : [];
  state.questions.push({ id: uid(), type, title: '', required: false, options: baseOptions });
  renderBuilder();
}

function updateQuestion(id, patch) {
  const question = state.questions.find(item => item.id === id);
  if (!question) return;
  Object.assign(question, patch);
  if ((question.type === 'single' || question.type === 'multiple') && question.options.length < 2) {
    question.options = ['选项 1', '选项 2'];
  }
  if (question.type !== 'single' && question.type !== 'multiple') {
    question.options = [];
  }
  renderBuilder();
}

function renderBuilder() {
  if (state.questions.length === 0) addQuestion('single');
  els.questions.innerHTML = state.questions.map((question, index) => renderQuestionEditor(question, index)).join('');
  renderPreview();
}

function renderQuestionEditor(question, index) {
  const optionsMarkup = question.type === 'single' || question.type === 'multiple'
    ? `<div class="option-list" data-options-for="${question.id}">
        ${question.options.map((option, optionIndex) => `
          <div class="option-row">
            <input value="${escapeHtml(option)}" data-action="update-option" data-question-id="${question.id}" data-option-index="${optionIndex}" placeholder="选项内容">
            <button type="button" class="danger" data-action="remove-option" data-question-id="${question.id}" data-option-index="${optionIndex}">删除</button>
          </div>
        `).join('')}
        <button type="button" class="secondary" data-action="add-option" data-question-id="${question.id}">添加选项</button>
      </div>`
    : '';

  return `
    <article class="question-card" data-question-id="${question.id}">
      <div class="question-head">
        <input value="${escapeHtml(question.title)}" data-action="update-title" data-question-id="${question.id}" placeholder="第 ${index + 1} 题题目">
        <select data-action="update-type" data-question-id="${question.id}">
          ${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${question.type === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <button type="button" class="danger" data-action="remove-question" data-question-id="${question.id}">删除题目</button>
      </div>
      <label class="required-row">
        <input type="checkbox" ${question.required ? 'checked' : ''} data-action="toggle-required" data-question-id="${question.id}">
        必填
      </label>
      ${optionsMarkup}
    </article>
  `;
}

function renderPreview() {
  const title = els.surveyTitle.value.trim() || '未命名问卷';
  const description = els.surveyDescription.value.trim() || '添加标题、说明和题目后，这里会实时预览。';
  els.previewTitle.textContent = title;
  els.previewDescription.textContent = description;
  els.previewQuestions.innerHTML = state.questions.map((question, index) => {
    const optionText = question.type === 'rating'
      ? ['1', '2', '3', '4', '5']
      : question.options;
    return `
      <div class="preview-question">
        <strong>${index + 1}. ${escapeHtml(question.title || '未填写题目')} ${question.required ? '<span aria-label="必填">*</span>' : ''}</strong>
        <div class="chip-row">
          <span class="chip">${typeLabels[question.type]}</span>
          ${optionText.map(option => `<span class="chip">${escapeHtml(option)}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

async function loadSurveys() {
  state.surveys = await api('/api/surveys');
  renderDashboard();
}

function renderDashboard() {
  els.surveyCount.textContent = state.surveys.length;
  els.responseCount.textContent = state.surveys.reduce((sum, survey) => sum + survey.responseCount, 0);

  if (state.surveys.length === 0) {
    els.surveyList.innerHTML = '<div class="empty-state"><h2>还没有问卷</h2><p>先到“设计问卷”创建第一份问卷。</p></div>';
    return;
  }

  els.surveyList.innerHTML = state.surveys.map(survey => {
    const fillLink = `${location.origin}/#/fill/${survey.id}`;
    return `
      <article class="survey-card">
        <h3>${escapeHtml(survey.title)}</h3>
        <p class="meta">${escapeHtml(survey.description || '暂无说明')}</p>
        <p class="meta">${survey.questionCount} 题 · ${survey.responseCount} 条回复 · ${survey.status === 'published' ? '已发布' : '草稿'}</p>
        <div class="card-actions">
          <button class="primary" data-action="open-fill" data-survey-id="${survey.id}">填写</button>
          <button class="secondary" data-action="copy-link" data-link="${escapeHtml(fillLink)}">复制链接</button>
          <button class="secondary" data-action="view-responses" data-survey-id="${survey.id}">查看回复</button>
          <button class="secondary" data-action="view-analysis" data-survey-id="${survey.id}">数据分析</button>
          <a class="ghost link-button" href="/api/surveys/${survey.id}/export.csv">导出 CSV</a>
        </div>
      </article>
    `;
  }).join('');
}

async function viewResponses(surveyId) {
  const [survey, responses] = await Promise.all([
    api(`/api/surveys/${surveyId}`),
    api(`/api/surveys/${surveyId}/responses`)
  ]);

  els.responsesPanel.classList.remove('hidden');
  els.responsesTitle.textContent = `${survey.title}：${responses.length} 条回复`;
  els.exportLink.href = `/api/surveys/${survey.id}/export.csv`;

  if (responses.length === 0) {
    els.responsesTable.innerHTML = '<div class="empty-state"><h2>暂无回复</h2><p>复制填写链接发给用户后，回复会出现在这里。</p></div>';
    return;
  }

  els.responsesTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>提交时间</th>
          ${survey.questions.map(question => `<th>${escapeHtml(question.title)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${responses.map(response => `
          <tr>
            <td>${new Date(response.submittedAt).toLocaleString()}</td>
            ${survey.questions.map(question => `<td>${escapeHtml(formatAnswer(response.answers[question.id]))}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function viewAnalysis(surveyId) {
  const analysis = await api(`/api/surveys/${surveyId}/analysis`);
  state.activeAnalysisSurveyId = surveyId;
  els.analysisPanel.classList.remove('hidden');
  els.analysisTitle.textContent = `${analysis.survey.title}：数据分析`;
  els.analysisContent.innerHTML = renderAnalysis(analysis);
  els.analysisPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAnalysis(analysis) {
  const overview = analysis.overview;
  return `
    <div class="analysis-grid">
      ${renderMetricCard('回复数', overview.responseCount)}
      ${renderMetricCard('题目数', overview.questionCount)}
      ${renderMetricCard('可数值题项', overview.numericQuestionCount)}
      ${renderMetricCard('完成率', `${overview.completionRate}%`)}
    </div>

    <div class="analysis-section">
      <h3>智能结论</h3>
      <div class="insight-list">
        ${analysis.insights.map(item => `<p>${escapeHtml(item)}</p>`).join('')}
      </div>
    </div>

    <div class="analysis-section">
      <h3>描述性统计</h3>
      ${renderQuestionAnalysis(analysis.questions)}
    </div>

    <div class="analysis-section">
      <h3>信度分析</h3>
      ${renderReliability(analysis.reliability)}
    </div>

    <div class="analysis-section">
      <h3>相关性分析</h3>
      ${renderCorrelations(analysis.correlations)}
    </div>
  `;
}

function renderMetricCard(label, value) {
  return `
    <div class="analysis-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderQuestionAnalysis(questions) {
  if (!questions.length) {
    return '<p class="meta">暂无题目。</p>';
  }

  return questions.map(question => {
    const details = question.frequencies
      ? renderFrequencyTable(question.frequencies, question.type === 'multiple')
      : renderTextSummary(question);
    const numeric = question.numeric
      ? `<p class="meta">均值 ${question.numeric.mean ?? '-'} · 标准差 ${question.numeric.std ?? '-'} · 最小值 ${question.numeric.min ?? '-'} · 最大值 ${question.numeric.max ?? '-'}</p>`
      : '';

    return `
      <article class="analysis-question">
        <div class="analysis-question-head">
          <strong>${escapeHtml(question.title)}</strong>
          <span class="chip">${typeLabels[question.type] || question.type}</span>
        </div>
        <p class="meta">有效回答 ${question.answered} · 缺失 ${question.missing}</p>
        ${numeric}
        ${details}
      </article>
    `;
  }).join('');
}

function renderFrequencyTable(rows, isMultiple = false) {
  if (!rows.length) return '<p class="meta">暂无可统计选项。</p>';
  return `
    <div class="table-wrap compact">
      <table>
        <thead>
          <tr>
            <th>选项</th>
            <th>次数</th>
            <th>${isMultiple ? '占回复比例' : '占比'}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${row.count}</td>
              <td>${isMultiple ? row.responsePercent : row.percent}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTextSummary(question) {
  if (!question.topValues?.length) {
    return '<p class="meta">暂无文本内容。</p>';
  }
  return `
    <p class="meta">不同答案 ${question.uniqueCount} 个，展示出现次数最高的答案。</p>
    <div class="text-answer-list">
      ${question.topValues.map(item => `<span>${escapeHtml(item.label)} <em>${item.count}</em></span>`).join('')}
    </div>
  `;
}

function renderReliability(reliability) {
  if (reliability.cronbachAlpha === null) {
    return "<p class=\"meta\">可数值题项不足或样本量不足，暂不能计算 Cronbach's alpha。建议至少包含 2 个评分题，并收集 2 份以上有效回复。</p>";
  }

  return `
    <div class="analysis-grid">
      ${renderMetricCard("Cronbach's alpha", reliability.cronbachAlpha)}
      ${renderMetricCard('题项数', reliability.itemCount)}
      ${renderMetricCard('完整样本', reliability.sampleSize)}
    </div>
  `;
}

function renderCorrelations(correlations) {
  if (!correlations.length) {
    return '<p class="meta">可数值题项少于 2 个，暂不生成 Pearson 相关结果。</p>';
  }

  return `
    <div class="table-wrap compact">
      <table>
        <thead>
          <tr>
            <th>题项 A</th>
            <th>题项 B</th>
            <th>Pearson r</th>
          </tr>
        </thead>
        <tbody>
          ${correlations.map(item => `
            <tr>
              <td>${escapeHtml(item.x)}</td>
              <td>${escapeHtml(item.y)}</td>
              <td>${item.r ?? '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function formatAnswer(value) {
  return Array.isArray(value) ? value.join('、') : value || '-';
}

async function openFillForm(surveyId) {
  const survey = await api(`/api/surveys/${surveyId}`);
  state.activeSurvey = survey;
  setView('fill');
  els.fillEmpty.classList.add('hidden');
  els.fillForm.classList.remove('hidden');
  els.fillForm.innerHTML = renderFillForm(survey);
}

function renderFillForm(survey) {
  return `
    <div>
      <p class="eyebrow">正在填写</p>
      <h2>${escapeHtml(survey.title)}</h2>
      <p class="meta">${escapeHtml(survey.description || '感谢你的填写。')}</p>
    </div>
    ${survey.questions.map((question, index) => renderFillQuestion(question, index)).join('')}
    <button type="submit" class="primary">提交问卷</button>
  `;
}

function renderFillQuestion(question, index) {
  const required = question.required ? 'required' : '';
  const title = `${index + 1}. ${escapeHtml(question.title)}${question.required ? ' *' : ''}`;

  if (question.type === 'textarea') {
    return `<div class="fill-question"><label>${title}<textarea rows="4" name="${question.id}" ${required}></textarea></label></div>`;
  }

  if (question.type === 'short') {
    return `<div class="fill-question"><label>${title}<input name="${question.id}" ${required}></label></div>`;
  }

  if (question.type === 'rating') {
    return `<div class="fill-question"><strong>${title}</strong>${['1', '2', '3', '4', '5'].map(value => `<label class="choice"><input type="radio" name="${question.id}" value="${value}" ${required}>${value} 分</label>`).join('')}</div>`;
  }

  const inputType = question.type === 'multiple' ? 'checkbox' : 'radio';
  return `
    <div class="fill-question">
      <strong>${title}</strong>
      ${question.options.map(option => `<label class="choice"><input type="${inputType}" name="${question.id}" value="${escapeHtml(option)}" ${question.type === 'single' ? required : ''}>${escapeHtml(option)}</label>`).join('')}
    </div>
  `;
}

function getFillAnswers(form, survey) {
  const formData = new FormData(form);
  return survey.questions.reduce((acc, question) => {
    acc[question.id] = question.type === 'multiple'
      ? formData.getAll(question.id)
      : formData.get(question.id) || '';
    return acc;
  }, {});
}

async function handleHashRoute() {
  const match = location.hash.match(/^#\/fill\/([^/]+)$/);
  if (!match) return;
  await openFillForm(match[1]);
}

els.tabs.forEach(tab => {
  tab.addEventListener('click', () => setView(tab.dataset.view));
});

document.querySelectorAll('[data-add-type]').forEach(button => {
  button.addEventListener('click', () => addQuestion(button.dataset.addType));
});

els.surveyTitle.addEventListener('input', renderPreview);
els.surveyDescription.addEventListener('input', renderPreview);

document.querySelector('#resetBuilder').addEventListener('click', () => {
  els.surveyForm.reset();
  state.questions = [];
  addQuestion('single');
  showToast('已清空设计区');
});

document.querySelector('#refreshDashboard').addEventListener('click', async () => {
  await loadSurveys();
  showToast('已刷新');
});

els.refreshAnalysis.addEventListener('click', async () => {
  if (!state.activeAnalysisSurveyId) {
    showToast('请先选择一份问卷进行分析');
    return;
  }
  await viewAnalysis(state.activeAnalysisSurveyId);
  showToast('已重新生成分析结果');
});

els.questions.addEventListener('input', event => {
  const target = event.target;
  const id = target.dataset.questionId;
  if (!id) return;

  if (target.dataset.action === 'update-title') {
    const question = state.questions.find(item => item.id === id);
    if (question) question.title = target.value;
    renderPreview();
  }
  if (target.dataset.action === 'update-option') {
    const question = state.questions.find(item => item.id === id);
    question.options[Number(target.dataset.optionIndex)] = target.value;
    renderPreview();
  }
});

els.questions.addEventListener('change', event => {
  const target = event.target;
  const id = target.dataset.questionId;
  if (!id) return;

  if (target.dataset.action === 'update-type') updateQuestion(id, { type: target.value });
  if (target.dataset.action === 'toggle-required') updateQuestion(id, { required: target.checked });
});

els.questions.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  const id = target.dataset.questionId;
  const question = state.questions.find(item => item.id === id);

  if (target.dataset.action === 'remove-question') {
    state.questions = state.questions.filter(item => item.id !== id);
    renderBuilder();
  }

  if (target.dataset.action === 'add-option' && question) {
    question.options.push(`选项 ${question.options.length + 1}`);
    renderBuilder();
  }

  if (target.dataset.action === 'remove-option' && question) {
    question.options.splice(Number(target.dataset.optionIndex), 1);
    renderBuilder();
  }
});

els.surveyForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const questions = state.questions.map(question => ({
      ...question,
      title: question.title.trim() || '未命名题目',
      options: question.options.map(option => option.trim()).filter(Boolean)
    }));
    const survey = await api('/api/surveys', {
      method: 'POST',
      body: JSON.stringify({
        title: els.surveyTitle.value,
        description: els.surveyDescription.value,
        status: 'published',
        questions
      })
    });
    showToast('问卷已发布，可以复制链接发放');
    els.surveyForm.reset();
    state.questions = [];
    addQuestion('single');
    await loadSurveys();
    setView('dashboard');
    await viewResponses(survey.id);
  } catch (error) {
    showToast(error.message);
  }
});

els.surveyList.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  try {
    if (target.dataset.action === 'open-fill') {
      location.hash = `#/fill/${target.dataset.surveyId}`;
      await openFillForm(target.dataset.surveyId);
    }

    if (target.dataset.action === 'view-responses') {
      await viewResponses(target.dataset.surveyId);
      showToast('已加载回复信息');
    }

    if (target.dataset.action === 'view-analysis') {
      await viewAnalysis(target.dataset.surveyId);
      showToast('已生成数据分析');
    }

    if (target.dataset.action === 'copy-link') {
      const copied = await copyText(target.dataset.link);
      showToast(copied ? '填写链接已复制' : `复制失败，请手动复制：${target.dataset.link}`);
    }
  } catch (error) {
    showToast(error.message);
  }
});

els.fillForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.activeSurvey) return;

  try {
    const answers = getFillAnswers(els.fillForm, state.activeSurvey);
    await api(`/api/surveys/${state.activeSurvey.id}/responses`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
    showToast('提交成功，感谢填写');
    els.fillForm.reset();
    await loadSurveys();
  } catch (error) {
    showToast(error.message);
  }
});

window.addEventListener('hashchange', handleHashRoute);

(async function init() {
  addQuestion('single');
  await loadSurveys();
  await handleHashRoute();
})().catch(error => showToast(error.message));

