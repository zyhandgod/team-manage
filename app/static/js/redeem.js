// 用户兑换页面 JavaScript

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) {
        return '';
    }
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

let currentEmail = '';
let currentCode = '';
let availableTeams = [];
let selectedTeamId = null;

function renderIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) {
        return;
    }

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';

    toast.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`;
    toast.className = `toast ${type} show`;
    renderIcons();

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function extractErrorMessage(data, fallback = '请求失败') {
    if (!data) {
        return fallback;
    }

    if (typeof data.detail === 'string') {
        return data.detail;
    }

    if (Array.isArray(data.detail)) {
        return data.detail.map((item) => item.msg || JSON.stringify(item)).join('; ');
    }

    if (data.error) {
        return data.error;
    }

    if (typeof data.message === 'string' && !data.success) {
        return data.message;
    }

    return fallback;
}

async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error('服务器响应格式错误');
    }
}

function showPanel(panelId) {
    document.querySelectorAll('.step').forEach((step) => {
        step.classList.remove('active');
        step.style.display = '';
    });

    const target = document.getElementById(panelId);
    if (target) {
        target.classList.add('active');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showStep(stepNumber) {
    showPanel(`step${stepNumber}`);
}

function backToStep1() {
    showStep(1);
    selectedTeamId = null;
}

function setButtonLoading(button, html) {
    if (!button) {
        return;
    }
    if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
    }
    button.disabled = true;
    button.innerHTML = html;
    renderIcons();
}

function restoreButton(button) {
    if (!button) {
        return;
    }
    button.disabled = false;
    if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
    }
    renderIcons();
}

const verifyForm = document.getElementById('verifyForm');
if (verifyForm) {
    verifyForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('email').value.trim();
        const code = document.getElementById('code').value.trim();
        const verifyBtn = document.getElementById('verifyBtn');

        if (!email || !code) {
            showToast('请填写完整信息', 'error');
            return;
        }

        currentEmail = email;
        currentCode = code;

        setButtonLoading(verifyBtn, '<i data-lucide="loader-circle" class="loading-spin"></i> 正在兑换...');
        await confirmRedeem(null);
        restoreButton(verifyBtn);
    });
}

const checkWarrantyBtn = document.getElementById('checkWarrantyBtn');
if (checkWarrantyBtn) {
    checkWarrantyBtn.addEventListener('click', checkWarranty);
}

const warrantyInput = document.getElementById('warrantyInput');
if (warrantyInput) {
    warrantyInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            checkWarranty();
        }
    });
}

function renderTeamsList() {
    const teamsList = document.getElementById('teamsList');
    if (!teamsList) {
        return;
    }

    teamsList.innerHTML = '';

    availableTeams.forEach((team) => {
        const teamCard = document.createElement('div');
        teamCard.className = 'team-card';
        teamCard.onclick = () => selectTeam(team.id, teamCard);

        const planBadge = team.subscription_plan === 'Plus' ? 'badge-plus' : 'badge-pro';

        teamCard.innerHTML = `
            <div class="team-name">${escapeHtml(team.team_name) || `Team ${team.id}`}</div>
            <div class="team-info">
                <div class="team-info-item">
                    <i data-lucide="users" style="width: 14px; height: 14px;"></i>
                    <span>${team.current_members}/${team.max_members} 成员</span>
                </div>
                <div class="team-info-item">
                    <span class="team-badge ${planBadge}">${escapeHtml(team.subscription_plan) || 'Plus'}</span>
                </div>
                ${team.expires_at ? `
                <div class="team-info-item">
                    <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
                    <span>到期: ${formatDate(team.expires_at)}</span>
                </div>
                ` : ''}
            </div>
        `;

        teamsList.appendChild(teamCard);
    });

    renderIcons();
}

function selectTeam(teamId, cardElement) {
    selectedTeamId = teamId;

    document.querySelectorAll('.team-card').forEach((card) => {
        card.classList.remove('selected');
    });

    if (cardElement) {
        cardElement.classList.add('selected');
    }

    confirmRedeem(teamId);
}

function autoSelectTeam() {
    if (availableTeams.length === 0) {
        showToast('没有可用的 Team', 'error');
        return;
    }

    confirmRedeem(null);
}

async function confirmRedeem(teamId) {
    try {
        const response = await fetch('/redeem/confirm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: currentEmail,
                code: currentCode,
                team_id: teamId
            })
        });

        const data = await parseJsonResponse(response);

        if (response.ok && data.success) {
            showSuccessResult(data);
            return;
        }

        showErrorResult(extractErrorMessage(data, '兑换失败'));
    } catch (error) {
        showErrorResult(error.message || '网络错误，请稍后重试');
    }
}

function showSuccessResult(data) {
    const resultContent = document.getElementById('resultContent');
    const teamInfo = data.team_info || {};

    resultContent.innerHTML = `
        <div class="result-success">
            <div class="result-icon"><i data-lucide="check-circle" style="width: 64px; height: 64px; color: var(--success);"></i></div>
            <div class="result-title">兑换成功</div>
            <div class="result-message">${escapeHtml(data.message || '您已成功加入 Team')}</div>

            <div class="result-details">
                <div class="result-detail-item">
                    <span class="result-detail-label">Team 名称</span>
                    <span class="result-detail-value">${escapeHtml(teamInfo.team_name) || '-'}</span>
                </div>
                <div class="result-detail-item">
                    <span class="result-detail-label">邮箱地址</span>
                    <span class="result-detail-value">${escapeHtml(currentEmail)}</span>
                </div>
                ${teamInfo.expires_at ? `
                <div class="result-detail-item">
                    <span class="result-detail-label">到期时间</span>
                    <span class="result-detail-value">${formatDateTime(teamInfo.expires_at)}</span>
                </div>
                ` : ''}
            </div>

            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 2rem; background: rgba(255,255,255,0.32); padding: 1rem; border-radius: 12px;">
                邀请邮件已发送到您的邮箱，请查收并按照邮件指引接受邀请。
            </p>

            <button onclick="location.reload()" class="btn btn-primary">
                <i data-lucide="refresh-cw"></i> 再次兑换
            </button>
        </div>
    `;

    renderIcons();
    showStep(3);
}

function showErrorResult(errorMessage) {
    const resultContent = document.getElementById('resultContent');

    resultContent.innerHTML = `
        <div class="result-error">
            <div class="result-icon"><i data-lucide="x-circle" style="width: 64px; height: 64px; color: var(--danger);"></i></div>
            <div class="result-title">兑换失败</div>
            <div class="result-message">${escapeHtml(errorMessage)}</div>

            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
                <button onclick="backToStep1()" class="btn btn-secondary">
                    <i data-lucide="arrow-left"></i> 返回重试
                </button>
                <button onclick="location.reload()" class="btn btn-primary">
                    <i data-lucide="rotate-ccw"></i> 重新开始
                </button>
            </div>
        </div>
    `;

    renderIcons();
    showStep(3);
}

function formatDate(dateString) {
    if (!dateString) {
        return '-';
    }

    try {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return escapeHtml(dateString);
        }
        return date.toLocaleDateString('zh-CN').replace(/\//g, '-');
    } catch (error) {
        return escapeHtml(dateString);
    }
}

function formatDateTime(dateString) {
    if (!dateString) {
        return '-';
    }

    try {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return escapeHtml(dateString);
        }
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(/\//g, '-');
    } catch (error) {
        return escapeHtml(dateString);
    }
}

function getTeamStatusMeta(status) {
    switch (status) {
        case 'active':
            return { label: '正常', className: 'status-pill-success' };
        case 'full':
            return { label: '已满', className: 'status-pill-warning' };
        case 'banned':
            return { label: '已封禁', className: 'status-pill-danger' };
        case 'expired':
            return { label: '已过期', className: 'status-pill-neutral' };
        case 'error':
            return { label: '异常', className: 'status-pill-warning' };
        default:
            return { label: status || '未知', className: 'status-pill-neutral' };
    }
}

async function checkWarranty() {
    const input = document.getElementById('warrantyInput').value.trim();
    const button = document.getElementById('checkWarrantyBtn');

    if (!input) {
        showToast('请输入原兑换码或邮箱进行查询', 'error');
        return;
    }

    let email = null;
    let code = null;
    if (input.includes('@')) {
        email = input;
    } else {
        code = input;
    }

    setButtonLoading(button, '<i data-lucide="loader-circle" class="loading-spin"></i> 查询中...');

    try {
        const response = await fetch('/warranty/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, code })
        });

        const data = await parseJsonResponse(response);
        if (response.ok && data.success) {
            showWarrantyResult(data);
            return;
        }

        showToast(extractErrorMessage(data, '查询失败'), 'error');
    } catch (error) {
        showToast(error.message || '网络错误，请稍后重试', 'error');
    } finally {
        restoreButton(button);
    }
}

function buildSummaryCards(data) {
    const latestRecord = Array.isArray(data.records) && data.records.length > 0 ? data.records[0] : null;
    const warrantyStatus = data.has_warranty
        ? (data.warranty_valid ? ['质保有效', 'status-pill-success'] : ['质保过期', 'status-pill-danger'])
        : ['无质保记录', 'status-pill-neutral'];
    const reuseStatus = data.can_reuse
        ? ['可重新兑换', 'status-pill-success']
        : ['暂不可重兑', 'status-pill-neutral'];
    let slotStatus = ['暂无车位信息', 'status-pill-neutral'];

    if (latestRecord) {
        if (latestRecord.team_status === 'full') {
            slotStatus = ['车位已满', 'status-pill-warning'];
        } else if (latestRecord.team_status === 'active') {
            slotStatus = ['车位未满', 'status-pill-success'];
        } else if (latestRecord.team_status === 'banned') {
            slotStatus = ['车位失效', 'status-pill-danger'];
        } else if (latestRecord.team_status === 'expired') {
            slotStatus = ['车位过期', 'status-pill-neutral'];
        } else if (latestRecord.team_status === 'error') {
            slotStatus = ['车位异常', 'status-pill-warning'];
        }
    }

    return `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="summary-label">质保状态</div>
                <div class="summary-value"><span class="status-pill ${warrantyStatus[1]}">${warrantyStatus[0]}</span></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">质保到期</div>
                <div class="summary-value">${formatDate(data.warranty_expires_at)}</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">车位状态</div>
                <div class="summary-value"><span class="status-pill ${slotStatus[1]}">${slotStatus[0]}</span></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">是否可重兑</div>
                <div class="summary-value"><span class="status-pill ${reuseStatus[1]}">${reuseStatus[0]}</span></div>
            </div>
        </div>
    `;
}

function buildReuseNotice(data) {
    if (!data.can_reuse || !data.original_code) {
        return '';
    }

    return `
        <div class="notice-card notice-card-success">
            <strong>当前可使用原兑换码重新加入</strong>
            <p>检测到您的车位已经失效，并且质保仍在有效期内。可以直接复制原兑换码，或点击一键换车。</p>
            <div class="inline-actions">
                <button type="button" class="btn-inline btn-inline-secondary copy-code-btn" data-code="${escapeHtml(data.original_code)}">
                    <i data-lucide="copy"></i> 复制原兑换码
                </button>
            </div>
        </div>
    `;
}

function buildRecordCard(record) {
    const statusMeta = getTeamStatusMeta(record.team_status);
    const hasWarrantyLabel = record.has_warranty ? '质保码' : '常规码';
    const canReplace = record.has_warranty && record.warranty_valid && record.team_status === 'banned' && record.code && (record.email || currentEmail);

    return `
        <div class="record-card">
            <div class="record-head">
                <div>
                    <div class="record-label">兑换码</div>
                    <div class="record-code">${escapeHtml(record.code)}</div>
                </div>
                <div class="record-badges">
                    <span class="status-pill ${record.has_warranty ? 'status-pill-info' : 'status-pill-neutral'}">${hasWarrantyLabel}</span>
                    <span class="status-pill ${statusMeta.className}">${statusMeta.label}</span>
                </div>
            </div>
            <div class="record-grid">
                <div class="record-meta">
                    <span>邮箱</span>
                    <strong>${escapeHtml(record.email || '-')}</strong>
                </div>
                <div class="record-meta">
                    <span>加入时间</span>
                    <strong>${formatDateTime(record.used_at)}</strong>
                </div>
                <div class="record-meta">
                    <span>Team 名称</span>
                    <strong>${escapeHtml(record.team_name || '-')}</strong>
                </div>
                <div class="record-meta">
                    <span>质保到期</span>
                    <strong>${record.has_warranty ? formatDate(record.warranty_expires_at) : '非质保码'}</strong>
                </div>
            </div>
            ${canReplace ? `
            <div class="inline-actions">
                <button type="button" class="btn-inline btn-inline-primary one-click-replace-btn" data-code="${escapeHtml(record.code)}" data-email="${escapeHtml(record.email || currentEmail)}">
                    <i data-lucide="refresh-cw"></i> 一键换车
                </button>
            </div>
            ` : ''}
        </div>
    `;
}

function bindWarrantyActions() {
    document.querySelectorAll('.copy-code-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            await copyWarrantyCode(button.dataset.code || '');
        });
    });

    document.querySelectorAll('.one-click-replace-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            await oneClickReplace(button.dataset.code || '', button.dataset.email || '', button);
        });
    });
}

function showWarrantyResult(data) {
    const warrantyContent = document.getElementById('warrantyContent');
    if (!warrantyContent) {
        return;
    }

    if (!Array.isArray(data.records) || data.records.length === 0) {
        warrantyContent.innerHTML = `
            <div class="warranty-empty">
                <div class="result-icon"><i data-lucide="info"></i></div>
                <div class="result-title">未找到兑换记录</div>
                <div class="result-message">${escapeHtml(data.message || '未找到相关记录')}</div>
                <div class="actions">
                    <button onclick="backToStep1()" class="btn btn-secondary">
                        <i data-lucide="arrow-left"></i> 返回兑换
                    </button>
                </div>
            </div>
        `;
        renderIcons();
        showPanel('warrantyResult');
        return;
    }

    warrantyContent.innerHTML = `
        <div class="warranty-result-view">
            ${buildSummaryCards(data)}
            ${buildReuseNotice(data)}
            <div class="records-section">
                <div class="section-heading section-heading-compact">
                    <div>
                        <h3>
                            <i data-lucide="history"></i>
                            我的兑换记录
                        </h3>
                    </div>
                </div>
                <div class="record-list">
                    ${data.records.map((record) => buildRecordCard(record)).join('')}
                </div>
            </div>
            <div class="actions">
                <button onclick="backToStep1()" class="btn btn-secondary">
                    <i data-lucide="arrow-left"></i> 返回兑换
                </button>
            </div>
        </div>
    `;

    renderIcons();
    bindWarrantyActions();
    showPanel('warrantyResult');
}

async function copyWarrantyCode(code) {
    if (!code) {
        showToast('没有可复制的兑换码', 'error');
        return;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
        } else {
            const tempInput = document.createElement('textarea');
            tempInput.value = code;
            tempInput.setAttribute('readonly', 'readonly');
            tempInput.style.position = 'absolute';
            tempInput.style.left = '-9999px';
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
        }
        showToast('兑换码已复制到剪贴板', 'success');
    } catch (error) {
        showToast('复制失败，请手动复制', 'error');
    }
}

async function oneClickReplace(code, email, buttonElement) {
    if (!code || !email) {
        showToast('无法获取完整信息，请手动重试', 'error');
        return;
    }

    currentCode = code;
    currentEmail = email;

    const emailInput = document.getElementById('email');
    const codeInput = document.getElementById('code');
    if (emailInput) {
        emailInput.value = email;
    }
    if (codeInput) {
        codeInput.value = code;
    }

    setButtonLoading(buttonElement, '<i data-lucide="loader-circle" class="loading-spin"></i> 处理中...');
    showToast('正在为您自动尝试重兑', 'info');

    try {
        await confirmRedeem(null);
    } finally {
        restoreButton(buttonElement);
    }
}
