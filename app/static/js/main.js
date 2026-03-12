/**
 * GPT Team 管理系统 - 通用 JavaScript
 */

const APP_CONFIG = window.APP_CONFIG || {
    adminBasePath: '/admin',
    loginPath: '/login',
    authBasePath: '/auth'
};

function joinBasePath(basePath, path = '') {
    const normalizedBase = (basePath || '').replace(/\/+$/, '');
    if (!path) {
        return normalizedBase || '/';
    }

    return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`;
}

function adminUrl(path = '') {
    return joinBasePath(APP_CONFIG.adminBasePath, path);
}

function authUrl(path = '') {
    return joinBasePath(APP_CONFIG.authBasePath, path);
}

function isAdminPath(pathname) {
    return pathname === APP_CONFIG.adminBasePath || pathname.startsWith(`${APP_CONFIG.adminBasePath}/`);
}

// Toast 提示函数
function showToast(message, type = 'info') {
    if (window.__antdMessageApi?.open) {
        window.__antdMessageApi.open({
            type: type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info',
            content: message,
            duration: type === 'error' ? 3.5 : 2.5
        });
        return;
    }

    const toast = document.getElementById('toast');
    if (!toast) return;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';

    toast.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
    toast.className = `toast ${type} show`;

    if (window.lucide) {
        lucide.createIcons();
    }

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 日期格式化函数
function formatDateTime(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 登出函数
async function logout(triggerEl = null) {
    if (!await confirmAction({
        title: '登出',
        content: '确定要登出吗？',
        okText: '确认登出',
        triggerEl
    })) {
        return;
    }

    try {
        const response = await fetch(authUrl('/logout'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            window.location.href = APP_CONFIG.loginPath;
        } else {
            showToast('登出失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

// API 调用封装
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.detail || '请求失败');
        }

        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 确认对话框
function normalizeConfirmOptions(options) {
    if (typeof options === 'string') {
        return {
            title: '确认操作',
            content: options,
            okText: '确定',
            cancelText: '取消',
            danger: false,
            triggerEl: null
        };
    }

    return {
        title: options?.title || '确认操作',
        content: options?.content || '',
        okText: options?.okText || '确定',
        cancelText: options?.cancelText || '取消',
        danger: Boolean(options?.danger),
        triggerEl: options?.triggerEl || null
    };
}

async function confirmAction(options) {
    const normalized = normalizeConfirmOptions(options);

    if (typeof window.__openAntdConfirm === 'function') {
        try {
            return await window.__openAntdConfirm(normalized);
        } catch (error) {
            console.error('AntD confirm 调用失败，回退到原生 confirm:', error);
        }
    }

    const fallbackMessage = normalized.content || normalized.title;
    return confirm(fallbackMessage);
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function () {
    // 检查认证状态
    checkAuthStatus();
});

// 检查认证状态
async function checkAuthStatus() {
    // 如果在登录页面,跳过检查
    if (window.location.pathname === APP_CONFIG.loginPath) {
        return;
    }

    try {
        const response = await fetch(authUrl('/status'));
        const data = await response.json();

        if (!data.authenticated && isAdminPath(window.location.pathname)) {
            // 未登录且在管理员页面,跳转到登录页
            window.location.href = APP_CONFIG.loginPath;
        }
    } catch (error) {
        console.error('检查认证状态失败:', error);
    }
}

// === 模态框控制逻辑 ===

function setBodyScrollLock(locked) {
    const body = document.body;
    if (!body) return;

    if (locked) {
        if (body.dataset.modalLockOverflow === undefined) {
            body.dataset.modalLockOverflow = body.style.overflow || '';
        }
        if (body.dataset.modalLockPaddingRight === undefined) {
            body.dataset.modalLockPaddingRight = body.style.paddingRight || '';
        }

        const scrollbarWidth = Math.max(window.innerWidth - document.documentElement.clientWidth, 0);
        body.style.overflow = 'hidden';
        body.style.paddingRight = scrollbarWidth > 0
            ? `${scrollbarWidth}px`
            : (body.dataset.modalLockPaddingRight || '');
        return;
    }

    body.style.overflow = body.dataset.modalLockOverflow || '';
    body.style.paddingRight = body.dataset.modalLockPaddingRight || '';
    delete body.dataset.modalLockOverflow;
    delete body.dataset.modalLockPaddingRight;
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        setBodyScrollLock(true);
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        const hasVisibleModal = document.querySelector('.modal-overlay.show');
        setBodyScrollLock(Boolean(hasVisibleModal));

        if (modalId === 'manageMembersModal') {
            clearManageMembersRefreshTimers();

            const shouldReloadPage = Boolean(window.manageMembersDirty);
            const reloadDelay = window.manageMembersPendingSync ? 2000 : 150;

            window.manageMembersDirty = false;
            window.manageMembersPendingSync = false;
            window.currentTeamId = null;

            if (shouldReloadPage) {
                setTimeout(() => {
                    window.location.reload();
                }, reloadDelay);
            }
        }
    }
}

function getTopVisibleModal() {
    const visibleModals = Array.from(document.querySelectorAll('.modal-overlay.show'));
    return visibleModals.length ? visibleModals[visibleModals.length - 1] : null;
}

document.addEventListener('click', event => {
    const modalOverlay = event.target.closest('.modal-overlay.show');
    if (!modalOverlay || event.target !== modalOverlay || !modalOverlay.id) {
        return;
    }

    hideModal(modalOverlay.id);
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') {
        return;
    }

    const topModal = getTopVisibleModal();
    if (!topModal || !topModal.id) {
        return;
    }

    event.preventDefault();
    hideModal(topModal.id);
});

function updateDashboardStats(stats) {
    if (!stats) return;

    Object.entries(stats).forEach(([key, value]) => {
        const element = document.querySelector(`[data-stat-key="${key}"]`);
        if (element) {
            element.textContent = value ?? 0;
        }
    });

    window.__dashboardStats = stats;
}

async function refreshDashboardStats() {
    const result = await apiCall(adminUrl('/dashboard/stats'));
    if (result.success && result.data.stats) {
        updateDashboardStats(result.data.stats);
    }
}

function syncTeamToVisibleTable(team) {
    updateTeamListRow(team);
    window.__teamListBridge?.upsertTeam?.(team);
}

function removeTeamFromVisibleTable(teamId) {
    const row = document.querySelector(`tr[data-team-id="${teamId}"]`);
    if (row) {
        row.remove();
    }

    window.__teamListBridge?.removeTeam?.(Number(teamId));
}

function switchModalTab(modalId, tabId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // 切换按钮状态
    const tabs = modal.querySelectorAll('.modal-tab-btn');
    tabs.forEach(tab => {
        if (tab.getAttribute('onclick').includes(`'${tabId}'`)) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // 切换面板显示
    const panels = modal.querySelectorAll('.import-panel, .card-body');
    panels.forEach(panel => {
        if (panel.id === tabId) {
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
        }
    });

    if (modalId === 'importTeamModal') {
        const parseEntryBtn = document.getElementById('importParseEntryBtn');
        if (parseEntryBtn) {
            parseEntryBtn.style.display = tabId === 'singleImport' ? 'inline-flex' : 'none';
        }
    }
}

/**
 * 切换质保时长输入框的显示
 */
function toggleWarrantyDays(checkbox, targetId) {
    const target = document.getElementById(targetId);
    if (target) {
        target.style.display = checkbox.checked ? 'block' : 'none';
    }
}

// === JSON 解析功能 ===

function extractSessionJsonFields(data) {
    let accountId = data.account?.id || data.accountId || '';
    if (!accountId && data.accessToken) {
        try {
            const payload = JSON.parse(atob(data.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            accountId = payload?.["https://api.openai.com/auth"]?.chatgpt_account_id || '';
        } catch (e) {
            accountId = '';
        }
    }

    return {
        email: data.user?.email || '',
        accessToken: data.accessToken || '',
        sessionToken: data.sessionToken || '',
        accountId
    };
}

function buildParseResultHtml(fields) {
    let resultHtml = '<div style="color: var(--success);">✅ 解析成功！已自动填充以下字段：</div><ul style="margin: 0.5rem 0; padding-left: 1.5rem; font-size: 0.8rem;">';

    if (fields.email) resultHtml += `<li>邮箱: ${fields.email}</li>`;
    if (fields.accessToken) resultHtml += `<li>Access Token: ${fields.accessToken.substring(0, 20)}...</li>`;
    if (fields.sessionToken) resultHtml += `<li>Session Token: ${fields.sessionToken.substring(0, 20)}...</li>`;
    if (fields.accountId) resultHtml += `<li>Account ID: ${fields.accountId}</li>`;

    if (!fields.email && !fields.accessToken && !fields.sessionToken && !fields.accountId) {
        return '<div style="color: var(--warning);">⚠️ 未找到有效的字段，请检查 JSON 格式</div>';
    }

    return `${resultHtml}</ul>`;
}

function parseSessionJsonIntoForm({
    inputId,
    resultId,
    formId,
    fieldMap,
    successMessage
}) {
    const jsonInput = document.getElementById(inputId);
    const resultDiv = document.getElementById(resultId);

    if (!jsonInput || !resultDiv) {
        showToast('找不到解析输入框', 'error');
        return false;
    }

    const jsonText = jsonInput.value.trim();
    if (!jsonText) {
        showToast('请先粘贴 JSON 数据', 'error');
        return false;
    }

    try {
        const data = JSON.parse(jsonText);
        const fields = extractSessionJsonFields(data);
        const form = document.getElementById(formId);

        if (form) {
            Object.entries(fieldMap).forEach(([fieldKey, inputName]) => {
                const target = form[inputName] || document.getElementById(inputName);
                const value = fields[fieldKey];
                if (target && value) {
                    target.value = value;
                }
            });
        }

        resultDiv.innerHTML = buildParseResultHtml(fields);
        jsonInput.value = '';

        showToast(successMessage || 'JSON 解析完成，字段已自动填充', 'success');
        return true;
    } catch (error) {
        resultDiv.innerHTML = `<div style="color: var(--danger);">❌ JSON 解析失败: ${error.message}</div>`;
        showToast('JSON 格式错误，请检查数据', 'error');
        return false;
    }
}

function parseAndFillJSON() {
    const success = parseSessionJsonIntoForm({
        inputId: 'jsonParseInput',
        resultId: 'parseResult',
        formId: 'singleImportForm',
        fieldMap: {
            email: 'email',
            accessToken: 'accessToken',
            sessionToken: 'sessionToken',
            accountId: 'accountId'
        },
        successMessage: 'JSON 解析完成，字段已自动填充'
    });

    if (success) {
        hideModal('importTeamParseModal');
    }

    return success;
}

function parseEditTeamJSON() {
    const success = parseSessionJsonIntoForm({
        inputId: 'editJsonParseInput',
        resultId: 'editParseResult',
        formId: 'editTeamForm',
        fieldMap: {
            email: 'edit-team-email',
            accessToken: 'edit-team-token',
            sessionToken: 'edit-team-session-token',
            accountId: 'edit-team-account-id'
        },
        successMessage: '编辑表单已根据 JSON 自动填充'
    });

    if (success) {
        hideModal('editTeamParseModal');
    }
}

function openOfficialAPI() {
    window.open('https://chatgpt.com/api/auth/session', '_blank', 'noopener');
    showToast('已打开 ChatGPT API 页面，请复制返回的 JSON 数据', 'info');
}

function clearAllFields() {
    const form = document.getElementById('singleImportForm');
    const jsonInput = document.getElementById('jsonParseInput');
    const resultDiv = document.getElementById('parseResult');
    
    if (form) form.reset();
    if (jsonInput) jsonInput.value = '';
    if (resultDiv) resultDiv.innerHTML = '';
    
    showToast('所有字段已清空', 'info');
}

function clearEditTeamParseInput(showMessage = true) {
    const jsonInput = document.getElementById('editJsonParseInput');
    const resultDiv = document.getElementById('editParseResult');

    if (jsonInput) jsonInput.value = '';
    if (resultDiv) resultDiv.innerHTML = '';

    if (showMessage) {
        showToast('解析框已清空', 'info');
    }
}

// === Team 导入逻辑 ===

async function handleSingleImport(event) {
    event.preventDefault();
    const form = event.target;
    const accessToken = form.accessToken.value.trim();
    const refreshToken = form.refreshToken ? form.refreshToken.value.trim() : null;
    const sessionToken = form.sessionToken ? form.sessionToken.value.trim() : null;
    const clientId = form.clientId ? form.clientId.value.trim() : null;
    const email = form.email.value.trim();
    const accountId = form.accountId.value.trim();
    const submitButton = form.querySelector('button[type="submit"]');

    if (!accessToken && !sessionToken && !refreshToken) {
        showToast('请至少填写 AT 或 ST；如果只填 RT，还需要同时填写 Client ID', 'error');
        return;
    }

    if (refreshToken && !clientId) {
        showToast('填写了 RT 时，请同时填写 Client ID', 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = '导入中...';

    try {
        const result = await apiCall(adminUrl('/teams/import'), {
            method: 'POST',
            body: JSON.stringify({
                import_type: 'single',
                access_token: accessToken || null,
                refresh_token: refreshToken || null,
                session_token: sessionToken || null,
                client_id: clientId || null,
                email: email || null,
                account_id: accountId || null
            })
        });

        if (result.success) {
            showToast('Team 导入成功！', 'success');
            form.reset();
            setTimeout(() => location.reload(), 1500);
        } else {
            showToast(result.error || '导入失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '导入';
    }
}

async function handleBatchImport(event) {
    event.preventDefault();
    const form = event.target;
    const batchContent = form.batchContent.value.trim();
    const submitButton = form.querySelector('button[type="submit"]');

    // UI 元素
    const progressContainer = document.getElementById('batchProgressContainer');
    const progressBar = document.getElementById('batchProgressBar');
    const progressStage = document.getElementById('batchProgressStage');
    const progressPercent = document.getElementById('batchProgressPercent');
    const successCountEl = document.getElementById('batchSuccessCount');
    const failedCountEl = document.getElementById('batchFailedCount');
    const resultsContainer = document.getElementById('batchResultsContainer');
    const resultsDiv = document.getElementById('batchResults');
    const finalSummaryEl = document.getElementById('batchFinalSummary');

    // 重置 UI
    progressContainer.style.display = 'block';
    resultsContainer.style.display = 'none';
    progressBar.style.width = '0%';
    progressStage.textContent = '准备导入...';
    progressPercent.textContent = '0%';
    successCountEl.textContent = '0';
    failedCountEl.textContent = '0';
    resultsDiv.innerHTML = '<table class="data-table"><thead><tr><th>邮箱</th><th>状态</th><th>消息</th></tr></thead><tbody id="batchResultsBody"></tbody></table>';
    const resultsBody = document.getElementById('batchResultsBody');

    submitButton.disabled = true;
    submitButton.textContent = '导入中...';

    try {
        const response = await fetch(adminUrl('/teams/import'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                import_type: 'batch',
                content: batchContent
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || errorData.detail || '请求失败');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 最后一个可能是残缺的

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);

                    if (data.type === 'start') {
                        progressStage.textContent = `开始导入 (共 ${data.total} 条)...`;
                    } else if (data.type === 'progress') {
                        const percent = Math.round((data.current / data.total) * 100);
                        progressBar.style.width = `${percent}%`;
                        progressPercent.textContent = `${percent}%`;
                        progressStage.textContent = `正在导入 ${data.current}/${data.total}...`;
                        successCountEl.textContent = data.success_count;
                        failedCountEl.textContent = data.failed_count;

                        // 实时添加到详情列表
                        if (data.last_result) {
                            resultsContainer.style.display = 'block';
                            const res = data.last_result;
                            const statusClass = res.success ? 'text-success' : 'text-danger';
                            const statusText = res.success ? '成功' : '失败';
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>${res.email}</td>
                                <td class="${statusClass}">${statusText}</td>
                                <td>${res.success ? (res.message || '导入成功') : res.error}</td>
                            `;
                            // 插入到最前面，方便看到最新的
                            resultsBody.insertBefore(row, resultsBody.firstChild);
                        }
                    } else if (data.type === 'finish') {
                        progressStage.textContent = '导入完成';
                        progressBar.style.width = '100%';
                        progressPercent.textContent = '100%';
                        finalSummaryEl.textContent = `总数: ${data.total} | 成功: ${data.success_count} | 失败: ${data.failed_count}`;

                        if (data.failed_count === 0) {
                            showToast('全部导入成功！', 'success');
                        } else {
                            showToast(`导入完成，成功 ${data.success_count} 条，失败 ${data.failed_count} 条`, 'warning');
                        }

                        // 刷新页面以显示新数据
                        if (data.success_count > 0) {
                            setTimeout(() => location.reload(), 3000);
                        }
                    } else if (data.type === 'error') {
                        showToast(data.error, 'error');
                    }
                } catch (e) {
                    console.error('解析流数据失败:', e, line);
                }
            }
        }
    } catch (error) {
        showToast(error.message || '网络错误', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '批量导入';
    }
}

// === 兑换码生成逻辑 ===

async function generateSingle(event) {
    event.preventDefault();
    const form = event.target;
    const customCode = form.customCode.value.trim();
    const expiresDays = form.expiresDays.value;
    const hasWarranty = form.hasWarranty.checked;
    const warrantyDays = form.warrantyDays ? form.warrantyDays.value : 30;

    const data = {
        type: 'single',
        has_warranty: hasWarranty,
        warranty_days: parseInt(warrantyDays || 30)
    };
    if (customCode) data.code = customCode;
    if (expiresDays) data.expires_days = parseInt(expiresDays);

    const result = await apiCall(adminUrl('/codes/generate'), {
        method: 'POST',
        body: JSON.stringify(data)
    });

    if (result.success) {
        document.getElementById('generatedCode').textContent = result.data.code;
        document.getElementById('singleResult').style.display = 'block';
        form.reset();
        showToast('兑换码生成成功', 'success');
        // 如果在列表中，延迟刷新
        if (window.location.pathname === adminUrl('/codes')) {
            setTimeout(() => location.reload(), 2000);
        }
    } else {
        showToast(result.error || '生成失败', 'error');
    }
}

async function generateBatch(event) {
    event.preventDefault();
    const form = event.target;
    const count = parseInt(form.count.value);
    const expiresDays = form.expiresDays.value;
    const hasWarranty = form.hasWarranty.checked;
    const warrantyDays = form.warrantyDays ? form.warrantyDays.value : 30;

    if (count < 1 || count > 1000) {
        showToast('生成数量必须在1-1000之间', 'error');
        return;
    }

    const data = {
        type: 'batch',
        count: count,
        has_warranty: hasWarranty,
        warranty_days: parseInt(warrantyDays || 30)
    };
    if (expiresDays) data.expires_days = parseInt(expiresDays);

    const result = await apiCall(adminUrl('/codes/generate'), {
        method: 'POST',
        body: JSON.stringify(data)
    });

    if (result.success) {
        document.getElementById('batchTotal').textContent = result.data.total;
        document.getElementById('batchCodes').value = result.data.codes.join('\n');
        document.getElementById('batchResult').style.display = 'block';
        form.reset();
        showToast(`成功生成 ${result.data.total} 个兑换码`, 'success');
        if (window.location.pathname === adminUrl('/codes')) {
            setTimeout(() => location.reload(), 3000);
        }
    } else {
        showToast(result.error || '生成失败', 'error');
    }
}

// 统一复制到剪贴板函数
async function copyToClipboard(text) {
    if (!text) return;

    try {
        // 尝试使用 Modern Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            showToast('已复制到剪贴板', 'success');
            return true;
        }
    } catch (err) {
        console.error('Modern copy failed:', err);
    }

    // Fallback: 使用 textarea 方式
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // 确保 textarea 不可见且不影响布局
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
            showToast('已复制到剪贴板', 'success');
            return true;
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
    }

    showToast('复制失败', 'error');
    return false;
}

// === 辅助函数 ===

function copyCode(code) {
    // 如果没有传入 code，尝试从生成结果中获取
    if (!code) {
        const generatedCodeEl = document.getElementById('generatedCode');
        code = generatedCodeEl ? generatedCodeEl.textContent : '';
    }

    if (code) {
        copyToClipboard(code);
    } else {
        showToast('无内容可复制', 'error');
    }
}

function copyBatchCodes() {
    const codes = document.getElementById('batchCodes').value;
    copyToClipboard(codes);
}

function downloadCodes() {
    const codes = document.getElementById('batchCodes').value;
    const blob = new Blob([codes], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redemption_codes_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('下载成功', 'success');
}
// === 成员管理逻辑 ===

async function viewMembers(teamId, teamEmail = '') {
    window.currentTeamId = teamId;
    window.manageMembersDirty = false;
    window.manageMembersPendingSync = false;
    clearManageMembersRefreshTimers();

    const modal = document.getElementById('manageMembersModal');
    if (!modal) return;

    // 设置基本信息
    document.getElementById('modalTeamEmail').textContent = teamEmail;

    // 打开模态框
    showModal('manageMembersModal');

    // 加载成员列表
    await loadModalMemberList(teamId);
}

function markManageMembersDirty(options = {}) {
    window.manageMembersDirty = true;
    if (options.pendingSync) {
        window.manageMembersPendingSync = true;
    }
}

function clearManageMembersRefreshTimers() {
    const timers = window.manageMembersRefreshTimers || [];
    timers.forEach(timerId => clearTimeout(timerId));
    window.manageMembersRefreshTimers = [];
}

function scheduleManageMembersRefresh(teamId) {
    clearManageMembersRefreshTimers();

    const delays = [1500, 4000];
    window.manageMembersRefreshTimers = delays.map(delay => setTimeout(async () => {
        if (window.currentTeamId !== teamId) {
            return;
        }

        await loadModalMemberList(teamId);
        await refreshTeamListRow(teamId);
    }, delay));
}

function getTeamStatusLabel(status) {
    switch (status) {
        case 'active':
            return '可用';
        case 'full':
            return '已满';
        case 'expired':
            return '已过期';
        case 'banned':
            return '已封禁';
        case 'error':
            return '异常';
        default:
            return '未知';
    }
}

function updateTeamListRow(team) {
    const row = document.querySelector(`tr[data-team-id="${team.id}"]`);
    if (!row) return;

    const memberCount = row.querySelector('.member-count');
    if (memberCount) {
        memberCount.textContent = `${team.current_members}/${team.max_members}`;
        memberCount.dataset.maxMembers = String(team.max_members);
    }

    const statusBadge = row.querySelector('.team-status-badge');
    if (statusBadge) {
        statusBadge.className = `status-badge team-status-badge status-${team.status}`;
        statusBadge.textContent = getTeamStatusLabel(team.status);
    }
}

async function refreshTeamListRow(teamId) {
    const result = await apiCall(adminUrl(`/teams/${teamId}/info`));
    if (result.success && result.data.team) {
        syncTeamToVisibleTable(result.data.team);
    }
}

async function loadModalMemberList(teamId) {
    const joinedTableBody = document.getElementById('modalJoinedMembersTableBody');
    const invitedTableBody = document.getElementById('modalInvitedMembersTableBody');

    if (joinedTableBody) joinedTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">加载中...</td></tr>';
    if (invitedTableBody) invitedTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">加载中...</td></tr>';

    try {
        const result = await apiCall(adminUrl(`/teams/${teamId}/members/list`));
        if (result.success) {
            const allMembers = result.data.members || [];
            const joinedMembers = allMembers.filter(m => m.status === 'joined');
            const invitedMembers = allMembers.filter(m => m.status === 'invited');

            // 渲染已加入成员
            if (joinedTableBody) {
                if (joinedMembers.length === 0) {
                    joinedTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">暂无已加入成员</td></tr>';
                } else {
                    joinedTableBody.innerHTML = joinedMembers.map(m => `
                        <tr>
                            <td>${m.email}</td>
                            <td>
                                <span class="role-badge role-${m.role}">
                                    ${m.role === 'account-owner' ? '所有者' : '成员'}
                                </span>
                            </td>
                            <td>${formatDateTime(m.added_at)}</td>
                            <td style="text-align: right;">
                                ${m.role !== 'account-owner' ? `
                                    <button onclick="deleteMember('${teamId}', '${m.user_id}', '${m.email}', true, this)" class="btn btn-sm btn-danger">
                                        <i data-lucide="trash-2"></i> 删除
                                    </button>
                                ` : '<span class="text-muted">不可删除</span>'}
                            </td>
                        </tr>
                    `).join('');
                }
            }

            // 渲染待加入成员
            if (invitedTableBody) {
                if (invitedMembers.length === 0) {
                    invitedTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">暂无待加入成员</td></tr>';
                } else {
                    invitedTableBody.innerHTML = invitedMembers.map(m => `
                        <tr>
                            <td>${m.email}</td>
                            <td>
                                <span class="role-badge role-${m.role}">成员</span>
                            </td>
                            <td>${formatDateTime(m.added_at)}</td>
                            <td style="text-align: right;">
                                <button onclick="revokeInvite('${teamId}', '${m.email}', true, this)" class="btn btn-sm btn-warning">
                                    <i data-lucide="undo"></i> 撤回
                                </button>
                            </td>
                        </tr>
                    `).join('');
                }
            }

            if (window.lucide) lucide.createIcons();
        } else {
            const errorMsg = `<tr><td colspan="4" style="text-align: center; color: var(--danger);">${result.error}</td></tr>`;
            if (joinedTableBody) joinedTableBody.innerHTML = errorMsg;
            if (invitedTableBody) invitedTableBody.innerHTML = errorMsg;
        }
    } catch (error) {
        const errorMsg = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">加载失败</td></tr>';
        if (joinedTableBody) joinedTableBody.innerHTML = errorMsg;
        if (invitedTableBody) invitedTableBody.innerHTML = errorMsg;
    }
}

async function revokeInvite(teamId, email, inModal = false, triggerEl = null) {
    if (!await confirmAction({
        title: '撤回邀请',
        content: `确定要撤回对 "${email}" 的邀请吗？`,
        okText: '确认撤回',
        triggerEl
    })) {
        return;
    }

    try {
        showToast('正在撤回...', 'info');
        const result = await apiCall(adminUrl(`/teams/${teamId}/invites/revoke`), {
            method: 'POST',
            body: JSON.stringify({ email: email })
        });

        if (result.success) {
            showToast('撤回成功', 'success');
            if (inModal) {
                markManageMembersDirty();
                await loadModalMemberList(teamId);
                await refreshTeamListRow(teamId);
            } else {
                setTimeout(() => location.reload(), 1000);
            }
        } else {
            showToast(result.error || '撤回失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

async function handleAddMember(event) {
    event.preventDefault();
    const form = event.target;
    const email = form.email.value.trim();
    const submitButton = document.getElementById('addMemberSubmitBtn');
    const teamId = window.currentTeamId;

    if (!teamId) {
        showToast('无法获取 Team ID', 'error');
        return;
    }

    submitButton.disabled = true;
    const originalText = submitButton.innerHTML;
    submitButton.textContent = '添加中...';

    try {
        const result = await apiCall(adminUrl(`/teams/${teamId}/members/add`), {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        if (result.success) {
            showToast(result.data.message || '成员添加成功！', 'success');
            form.reset();
            // 在模态框模式下，只负载列表
            if (document.getElementById('manageMembersModal').classList.contains('show')) {
                markManageMembersDirty({ pendingSync: Boolean(result.data.pending_sync) });
                await loadModalMemberList(teamId);
                await refreshTeamListRow(teamId);
                if (result.data.pending_sync) {
                    scheduleManageMembersRefresh(teamId);
                }
            } else {
                setTimeout(() => location.reload(), 1500);
            }
        } else {
            showToast(result.error || '添加失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalText;
    }
}

async function deleteMember(teamId, userId, email, inModal = false, triggerEl = null) {
    if (!await confirmAction({
        title: '删除成员',
        content: `确定要删除成员 "${email}" 吗？此操作不可恢复。`,
        okText: '确认删除',
        danger: true,
        triggerEl
    })) {
        return;
    }

    try {
        showToast('正在删除...', 'info');
        const result = await apiCall(adminUrl(`/teams/${teamId}/members/${userId}/delete`), {
            method: 'POST'
        });

        if (result.success) {
            showToast('删除成功', 'success');
            if (inModal) {
                markManageMembersDirty();
                await loadModalMemberList(teamId);
                await refreshTeamListRow(teamId);
            } else {
                setTimeout(() => location.reload(), 1000);
            }
        } else {
            showToast(result.error || '删除失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}
