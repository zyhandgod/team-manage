import { useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Badge,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ExportOutlined,
  FilterOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UndoOutlined,
  UserAddOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { TextArea } = Input;

const COLUMN_STORAGE_KEY = 'team_list_island_columns';
const DEFAULT_COLUMNS = [
  'id',
  'email',
  'status',
  'device_code_auth_enabled',
  'team_name',
  'members',
  'subscription_plan',
  'expires_at',
  'credential',
  'account_id',
  'actions'
];

const STATUS_OPTIONS = [
  { label: '所有状态', value: '' },
  { label: '可用', value: 'active' },
  { label: '已满', value: 'full' },
  { label: '已过期', value: 'expired' },
  { label: '异常', value: 'error' },
  { label: '已封禁', value: 'banned' }
];

const STATUS_MAP = {
  active: { label: '可用', color: 'green' },
  full: { label: '已满', color: 'gold' },
  expired: { label: '已过期', color: 'red' },
  banned: { label: '已封禁', color: 'volcano' },
  error: { label: '异常', color: 'magenta' }
};

const MEMBER_ROLE_MAP = {
  'account-owner': { label: '所有者', color: 'blue' },
  member: { label: '成员', color: 'default' }
};

const IMPORT_JSON_PLACEHOLDER = `粘贴从 https://chatgpt.com/api/auth/session 获取的 JSON 数据，例如:
{
  "user": {"email": "your@email.com"},
  "accessToken": "eyJ...",
  "sessionToken": "eyJ..."
}`;

const IMPORT_FIELD_EXTRAS = {
  access_token: '推荐填写。以 eyJ 开头；如果暂时没有，系统也可以先尝试用 ST 换取新的 AT。',
  session_token: '长期使用更推荐填写。系统会优先用 ST 刷新 AT；不会自动从官方页面读取这个值。',
  client_id: '使用 Refresh Token 时必填',
  refresh_token: '可选，用于自动刷新 AT。拿不到可以留空。',
  email: '可选，如果不填写将从 Token 中自动提取',
  account_id: '可选，如果不填写将从 API 自动获取'
};

function buildAdminUrl(path = '') {
  const basePath = window.APP_CONFIG?.adminBasePath || '';
  const normalizedBase = basePath.replace(/\/+$/, '');
  if (!path) {
    return normalizedBase || '/';
  }
  return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function buildNextUrl({ search, statusFilter, page, perPage }) {
  const url = new URL(window.location.href);

  if (search) {
    url.searchParams.set('search', search);
  } else {
    url.searchParams.delete('search');
  }

  if (statusFilter) {
    url.searchParams.set('status', statusFilter);
  } else {
    url.searchParams.delete('status');
  }

  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));
  return url.toString();
}

function getCredentialMeta(team) {
  if (team.has_session_token) {
    return {
      badges: ['AT', 'ST'].filter(badge => badge !== 'AT' || team.has_access_token),
      note: '可自动续期'
    };
  }

  if (team.has_refresh_token) {
    return {
      badges: [team.has_access_token ? 'AT' : null, 'RT'].filter(Boolean),
      note: '依赖 RT 续期'
    };
  }

  return {
    badges: team.has_access_token ? ['AT'] : ['仅 AT'],
    note: '长期稳定性较弱'
  };
}

function CredentialCell({ team }) {
  const meta = getCredentialMeta(team);

  return (
    <div className="team-list-credential-cell">
      <Space size={4} wrap>
        {meta.badges.map(badge => (
          <Tag
            key={badge}
            color={badge === 'AT' ? 'default' : badge === 'ST' ? 'blue' : badge === 'RT' ? 'cyan' : 'orange'}
            bordered={false}
          >
            {badge}
          </Tag>
        ))}
      </Space>
      <div className="team-list-credential-note">{meta.note}</div>
    </div>
  );
}

function renderStatusTag(value) {
  const statusMeta = STATUS_MAP[value] || { label: value || '未知', color: 'default' };
  return (
    <Tag color={statusMeta.color} bordered={false}>
      {statusMeta.label}
    </Tag>
  );
}

function extractSessionJsonFields(data) {
  let accountId = data?.account?.id || data?.accountId || '';

  if (!accountId && data?.accessToken) {
    try {
      const payload = JSON.parse(atob(data.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      accountId = payload?.['https://api.openai.com/auth']?.chatgpt_account_id || '';
    } catch (error) {
      accountId = '';
    }
  }

  return {
    email: data?.user?.email || '',
    accessToken: data?.accessToken || '',
    sessionToken: data?.sessionToken || '',
    accountId
  };
}

function splitMembers(members = []) {
  return {
    joined: members.filter(member => member.status === 'joined'),
    invited: members.filter(member => member.status === 'invited')
  };
}

function TeamListIsland({ bootstrap }) {
  const { message } = App.useApp();
  const [editForm] = Form.useForm();
  const [singleImportForm] = Form.useForm();
  const [memberForm] = Form.useForm();
  const editStatusValue = Form.useWatch('status', editForm);
  const editTeamNameValue = Form.useWatch('team_name', editForm);
  const editAccountIdValue = Form.useWatch('account_id', editForm);
  const editAccountRoleValue = Form.useWatch('account_role', editForm);
  const editDeviceAuthValue = Form.useWatch('device_code_auth_enabled', editForm);

  const [teamsData, setTeamsData] = useState(bootstrap.teams || []);
  const [paginationState, setPaginationState] = useState(
    bootstrap.pagination || { current_page: 1, per_page: 20, total: (bootstrap.teams || []).length }
  );
  const [appliedSearch, setAppliedSearch] = useState(bootstrap.search || '');
  const [searchValue, setSearchValue] = useState(bootstrap.search || '');
  const [statusFilter, setStatusFilter] = useState(bootstrap.status_filter || '');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [teamActionLoading, setTeamActionLoading] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editParseOpen, setEditParseOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editRefreshingToken, setEditRefreshingToken] = useState(false);
  const [currentEditTeamId, setCurrentEditTeamId] = useState(null);
  const [editParseValue, setEditParseValue] = useState('');
  const [editParseError, setEditParseError] = useState('');

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importParseOpen, setImportParseOpen] = useState(false);
  const [importTab, setImportTab] = useState('single');
  const [singleImportSubmitting, setSingleImportSubmitting] = useState(false);
  const [batchImportSubmitting, setBatchImportSubmitting] = useState(false);
  const [batchImportText, setBatchImportText] = useState('');
  const [importParseValue, setImportParseValue] = useState('');
  const [importParseError, setImportParseError] = useState('');
  const [batchImportState, setBatchImportState] = useState({
    stage: '',
    percent: 0,
    successCount: 0,
    failedCount: 0,
    results: [],
    summary: '',
    running: false
  });

  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberActionLoading, setMemberActionLoading] = useState('');
  const [currentMembersTeam, setCurrentMembersTeam] = useState(null);
  const [joinedMembers, setJoinedMembers] = useState([]);
  const [invitedMembers, setInvitedMembers] = useState([]);
  const membersTeamIdRef = useRef(null);
  const membersDirtyRef = useRef(false);
  const membersPendingSyncRef = useRef(false);
  const membersRefreshTimersRef = useRef([]);

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || 'null');
      if (Array.isArray(stored) && stored.length > 0) {
        return stored;
      }
    } catch (error) {
      console.error('读取列表列配置失败:', error);
    }
    return DEFAULT_COLUMNS;
  });

  useEffect(() => {
    const fallback = document.getElementById('teamListFallback');
    if (fallback) {
      fallback.style.display = 'none';
    }
  }, []);

  useEffect(() => {
    window.__antdMessageApi = message;
    return () => {
      delete window.__antdMessageApi;
    };
  }, [message]);

  useEffect(() => {
    window.__openAntdConfirm = options => new Promise(resolve => {
      const rect = options?.triggerEl?.getBoundingClientRect?.();

      setConfirmState({
        title: options.title,
        content: options.content,
        okText: options.okText || '确定',
        cancelText: options.cancelText || '取消',
        danger: Boolean(options.danger),
        rect: rect || null,
        resolve
      });
    });

    return () => {
      delete window.__openAntdConfirm;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const normalizedSearch = appliedSearch.trim().toLowerCase();

  function matchesCurrentView(team) {
    const matchesStatus = !statusFilter || team.status === statusFilter;
    if (!matchesStatus) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      team.id,
      team.email,
      team.account_id,
      team.team_name
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  }

  function updateDashboardFromPayload(payload) {
    if (!payload) return;
    setTeamsData(payload.teams || []);
    setPaginationState(
      payload.pagination || { current_page: 1, per_page: 20, total: (payload.teams || []).length }
    );
    setAppliedSearch(payload.search || '');
    setSearchValue(payload.search || '');
    setStatusFilter(payload.status_filter || '');
    window.updateDashboardStats?.(payload.stats || {});
  }

  async function reloadCurrentPageData(overrides = {}) {
    const query = {
      page: overrides.page ?? paginationState.current_page ?? 1,
      per_page: overrides.perPage ?? paginationState.per_page ?? 20,
      search: overrides.search ?? appliedSearch,
      status: overrides.statusFilter ?? statusFilter
    };

    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('per_page', String(query.per_page));
    if (query.search) {
      params.set('search', query.search);
    }
    if (query.status) {
      params.set('status', query.status);
    }

    setTableLoading(true);
    try {
      const response = await fetch(buildAdminUrl(`/dashboard/data?${params.toString()}`));
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '获取最新列表失败');
      }

      updateDashboardFromPayload(result.data);
      setSelectedRowKeys(currentKeys => {
        const currentIds = new Set((result.data?.teams || []).map(team => String(team.id)));
        return currentKeys.filter(key => currentIds.has(String(key)));
      });
    } catch (error) {
      window.showToast?.(error.message || '获取最新列表失败', 'error');
    } finally {
      setTableLoading(false);
    }
  }

  useEffect(() => {
    function upsertTeam(team) {
      setTeamsData(currentTeams => {
        const exists = currentTeams.some(item => item.id === team.id);
        const matchesView = matchesCurrentView(team);

        if (!matchesView) {
          return currentTeams.filter(item => item.id !== team.id);
        }

        if (exists) {
          return currentTeams.map(item => (item.id === team.id ? { ...item, ...team } : item));
        }

        return currentTeams;
      });
    }

    function removeTeam(teamId) {
      setTeamsData(currentTeams => currentTeams.filter(item => String(item.id) !== String(teamId)));
      setSelectedRowKeys(currentKeys => currentKeys.filter(key => String(key) !== String(teamId)));
      setPaginationState(current => ({
        ...current,
        total: Math.max((current?.total || 0) - 1, 0)
      }));
    }

    window.__teamListBridge = {
      upsertTeam,
      removeTeam,
      reload: reloadCurrentPageData
    };

    return () => {
      delete window.__teamListBridge;
    };
  }, [normalizedSearch, statusFilter, paginationState.current_page, paginationState.per_page, appliedSearch]);

  function mapTeamToFormValues(team) {
    return {
      email: team.email || '',
      access_token: team.access_token || '',
      session_token: team.session_token || '',
      client_id: team.client_id || '',
      refresh_token: team.refresh_token || '',
      account_id: team.account_id || '',
      team_name: team.team_name || '',
      account_role: team.account_role || '未知',
      device_code_auth_enabled: team.device_code_auth_enabled ? '已开启' : '未开启',
      max_members: team.max_members || 5,
      status: team.status || 'active'
    };
  }

  async function fetchTeamInfo(teamId) {
    const response = await fetch(buildAdminUrl(`/teams/${teamId}/info`));
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || '获取 Team 信息失败');
    }

    return result.team;
  }

  async function syncTeamState(teamId, options = {}) {
    const team = await fetchTeamInfo(teamId);
    window.__teamListBridge?.upsertTeam?.(team);
    window.updateTeamListRow?.(team);
    await window.refreshDashboardStats?.();

    if (options.updateForm) {
      editForm.setFieldsValue(mapTeamToFormValues(team));
    }

    if (currentMembersTeam && String(currentMembersTeam.id) === String(team.id)) {
      setCurrentMembersTeam(previous => ({
        ...(previous || {}),
        id: team.id,
        email: team.email || previous?.email || ''
      }));
    }

    return team;
  }

  async function handleRefreshTeam(teamId) {
    const loadingKey = `refresh-${teamId}`;
    setTeamActionLoading(loadingKey);
    message.open({ key: loadingKey, type: 'loading', content: '正在刷新...', duration: 0 });

    try {
      const response = await fetch(`/api/teams/${teamId}/refresh?force=true`, { method: 'GET' });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '刷新失败');
      }

      await syncTeamState(teamId);
      message.open({ key: loadingKey, type: 'success', content: '刷新成功' });
    } catch (error) {
      message.open({ key: loadingKey, type: 'error', content: error.message || '刷新失败' });
    } finally {
      setTeamActionLoading('');
    }
  }

  async function handleEnableDeviceAuth(teamId) {
    const loadingKey = `device-auth-${teamId}`;
    setTeamActionLoading(loadingKey);
    message.open({ key: loadingKey, type: 'loading', content: '正在开启...', duration: 0 });

    try {
      const response = await fetch(buildAdminUrl(`/teams/${teamId}/enable-device-auth`), {
        method: 'POST'
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '开启失败');
      }

      await syncTeamState(teamId);
      message.open({ key: loadingKey, type: 'success', content: '开启成功' });
    } catch (error) {
      message.open({ key: loadingKey, type: 'error', content: error.message || '开启失败' });
    } finally {
      setTeamActionLoading('');
    }
  }

  async function handleDeleteTeam(teamId) {
    const loadingKey = `delete-${teamId}`;
    setTeamActionLoading(loadingKey);
    message.open({ key: loadingKey, type: 'loading', content: '正在删除...', duration: 0 });

    try {
      const response = await fetch(buildAdminUrl(`/teams/${teamId}/delete`), {
        method: 'POST'
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '删除失败');
      }

      await reloadCurrentPageData();
      message.open({ key: loadingKey, type: 'success', content: '删除成功' });
    } catch (error) {
      message.open({ key: loadingKey, type: 'error', content: error.message || '删除失败' });
    } finally {
      setTeamActionLoading('');
    }
  }

  async function openEditModal(teamId) {
    setEditLoading(true);
    setEditParseOpen(false);
    setEditParseValue('');
    setEditParseError('');

    try {
      const team = await fetchTeamInfo(teamId);
      setCurrentEditTeamId(team.id);
      editForm.setFieldsValue(mapTeamToFormValues(team));
      setEditModalOpen(true);
    } catch (error) {
      window.showToast?.(error.message || '获取信息失败', 'error');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleRefreshAccessToken() {
    if (!currentEditTeamId) {
      return;
    }

    setEditRefreshingToken(true);
    try {
      const response = await fetch(`/api/teams/${currentEditTeamId}/refresh?force=true`, { method: 'GET' });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '刷新失败');
      }

      await syncTeamState(currentEditTeamId, { updateForm: true });
      window.showToast?.('刷新成功', 'success');
    } catch (error) {
      window.showToast?.(error.message || '刷新失败', 'error');
    } finally {
      setEditRefreshingToken(false);
    }
  }

  async function handleSaveEdit(values) {
    if (!currentEditTeamId) {
      return;
    }

    setEditSaving(true);

    try {
      const response = await fetch(buildAdminUrl(`/teams/${currentEditTeamId}/update`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '更新失败');
      }

      await syncTeamState(currentEditTeamId);
      setEditModalOpen(false);
      setEditParseOpen(false);
      setEditParseValue('');
      setEditParseError('');
      window.showToast?.('更新成功', 'success');
    } catch (error) {
      window.showToast?.(error.message || '更新失败', 'error');
    } finally {
      setEditSaving(false);
    }
  }

  function handleParseEditJson() {
    if (!editParseValue.trim()) {
      setEditParseError('请先粘贴 JSON 数据');
      return;
    }

    try {
      const fields = extractSessionJsonFields(JSON.parse(editParseValue));
      editForm.setFieldsValue({
        email: fields.email || editForm.getFieldValue('email'),
        access_token: fields.accessToken || editForm.getFieldValue('access_token'),
        session_token: fields.sessionToken || editForm.getFieldValue('session_token'),
        account_id: fields.accountId || editForm.getFieldValue('account_id')
      });
      setEditParseError('');
      setEditParseValue('');
      setEditParseOpen(false);
      window.showToast?.('编辑表单已根据 JSON 自动填充', 'success');
    } catch (error) {
      setEditParseError(`JSON 解析失败: ${error.message}`);
    }
  }

  function resetImportState() {
    singleImportForm.resetFields();
    setImportTab('single');
    setImportParseOpen(false);
    setImportParseValue('');
    setImportParseError('');
    setBatchImportText('');
    setBatchImportSubmitting(false);
    setBatchImportState({
      stage: '',
      percent: 0,
      successCount: 0,
      failedCount: 0,
      results: [],
      summary: '',
      running: false
    });
  }

  function openImportModal() {
    resetImportState();
    setImportModalOpen(true);
  }

  function handleParseImportJson() {
    if (!importParseValue.trim()) {
      setImportParseError('请先粘贴 JSON 数据');
      return;
    }

    try {
      const fields = extractSessionJsonFields(JSON.parse(importParseValue));
      singleImportForm.setFieldsValue({
        email: fields.email || singleImportForm.getFieldValue('email'),
        access_token: fields.accessToken || singleImportForm.getFieldValue('access_token'),
        session_token: fields.sessionToken || singleImportForm.getFieldValue('session_token'),
        account_id: fields.accountId || singleImportForm.getFieldValue('account_id')
      });
      setImportParseError('');
      setImportParseValue('');
      setImportParseOpen(false);
      window.showToast?.('JSON 解析完成，字段已自动填充', 'success');
    } catch (error) {
      setImportParseError(`JSON 解析失败: ${error.message}`);
    }
  }

  async function handleSingleImport(values) {
    const accessToken = values.access_token?.trim() || null;
    const refreshToken = values.refresh_token?.trim() || null;
    const sessionToken = values.session_token?.trim() || null;
    const clientId = values.client_id?.trim() || null;
    const email = values.email?.trim() || null;
    const accountId = values.account_id?.trim() || null;

    if (!accessToken && !sessionToken && !refreshToken) {
      window.showToast?.('请至少填写 AT 或 ST；如果只填 RT，还需要同时填写 Client ID', 'error');
      return;
    }

    if (refreshToken && !clientId) {
      window.showToast?.('填写了 RT 时，请同时填写 Client ID', 'error');
      return;
    }

    setSingleImportSubmitting(true);
    try {
      const response = await fetch(buildAdminUrl('/teams/import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          import_type: 'single',
          access_token: accessToken,
          refresh_token: refreshToken,
          session_token: sessionToken,
          client_id: clientId,
          email,
          account_id: accountId
        })
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '导入失败');
      }

      window.showToast?.(result.message || 'Team 导入成功', 'success');
      setImportModalOpen(false);
      resetImportState();
      await reloadCurrentPageData();
    } catch (error) {
      window.showToast?.(error.message || '导入失败', 'error');
    } finally {
      setSingleImportSubmitting(false);
    }
  }

  async function handleBatchImport() {
    if (!batchImportText.trim()) {
      window.showToast?.('请先粘贴批量导入内容', 'error');
      return;
    }

    setBatchImportSubmitting(true);
    setBatchImportState({
      stage: '准备导入...',
      percent: 0,
      successCount: 0,
      failedCount: 0,
      results: [],
      summary: '',
      running: true
    });

    try {
      const response = await fetch(buildAdminUrl('/teams/import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          import_type: 'batch',
          content: batchImportText
        })
      });

      if (!response.ok || !response.body) {
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
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);
            if (data.type === 'start') {
              setBatchImportState(current => ({
                ...current,
                stage: `开始导入 (共 ${data.total} 条)...`
              }));
            } else if (data.type === 'progress') {
              const percent = Math.round((data.current / data.total) * 100);
              setBatchImportState(current => ({
                ...current,
                stage: `正在导入 ${data.current}/${data.total}...`,
                percent,
                successCount: data.success_count,
                failedCount: data.failed_count,
                results: data.last_result
                  ? [data.last_result, ...current.results].slice(0, 100)
                  : current.results
              }));
            } else if (data.type === 'finish') {
              setBatchImportState(current => ({
                ...current,
                stage: '导入完成',
                percent: 100,
                successCount: data.success_count,
                failedCount: data.failed_count,
                summary: `总数: ${data.total} | 成功: ${data.success_count} | 失败: ${data.failed_count}`,
                running: false
              }));

              if (data.success_count > 0) {
                await reloadCurrentPageData();
              }

              if (data.failed_count === 0) {
                window.showToast?.('全部导入成功！', 'success');
              } else {
                window.showToast?.(`导入完成，成功 ${data.success_count} 条，失败 ${data.failed_count} 条`, 'warning');
              }
            } else if (data.type === 'error') {
              throw new Error(data.error || '批量导入失败');
            }
          } catch (error) {
            console.error('解析批量导入流数据失败:', error, line);
          }
        }
      }
    } catch (error) {
      setBatchImportState(current => ({
        ...current,
        running: false,
        stage: '导入失败'
      }));
      window.showToast?.(error.message || '批量导入失败', 'error');
    } finally {
      setBatchImportSubmitting(false);
    }
  }

  function clearMembersRefreshTimers() {
    membersRefreshTimersRef.current.forEach(timerId => clearTimeout(timerId));
    membersRefreshTimersRef.current = [];
  }

  function markMembersDirty(options = {}) {
    membersDirtyRef.current = true;
    if (options.pendingSync) {
      membersPendingSyncRef.current = true;
    }
  }

  async function loadMembers(teamId) {
    setMembersLoading(true);

    try {
      const response = await fetch(buildAdminUrl(`/teams/${teamId}/members/list`));
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '加载成员列表失败');
      }

      const parsed = splitMembers(result.members || []);
      setJoinedMembers(parsed.joined);
      setInvitedMembers(parsed.invited);
    } catch (error) {
      setJoinedMembers([]);
      setInvitedMembers([]);
      window.showToast?.(error.message || '加载成员列表失败', 'error');
    } finally {
      setMembersLoading(false);
    }
  }

  function scheduleMembersRefresh(teamId) {
    clearMembersRefreshTimers();

    const delays = [1500, 4000];
    membersRefreshTimersRef.current = delays.map(delay => setTimeout(async () => {
      if (String(membersTeamIdRef.current) !== String(teamId)) {
        return;
      }

      await loadMembers(teamId);
      await syncTeamState(teamId);
    }, delay));
  }

  async function openMembersModal(teamId, email = '') {
    clearMembersRefreshTimers();
    membersDirtyRef.current = false;
    membersPendingSyncRef.current = false;
    membersTeamIdRef.current = String(teamId);
    memberForm.resetFields();
    setCurrentMembersTeam({ id: String(teamId), email });
    setMembersModalOpen(true);
    await loadMembers(teamId);
    await reloadCurrentPageData();
  }

  function closeMembersModal() {
    clearMembersRefreshTimers();
    setMembersModalOpen(false);

    const shouldReload = membersDirtyRef.current;
    const pendingSync = membersPendingSyncRef.current;

    membersDirtyRef.current = false;
    membersPendingSyncRef.current = false;
    membersTeamIdRef.current = null;
    setCurrentMembersTeam(null);
    setJoinedMembers([]);
    setInvitedMembers([]);
    memberForm.resetFields();

    if (shouldReload) {
      reloadCurrentPageData();
      if (pendingSync) {
        setTimeout(() => {
          reloadCurrentPageData();
        }, 2000);
      }
    }
  }

  async function handleAddMember(values) {
    const teamId = membersTeamIdRef.current;
    if (!teamId) {
      window.showToast?.('无法获取 Team ID', 'error');
      return;
    }

    setMemberSubmitting(true);
    try {
      const response = await fetch(buildAdminUrl(`/teams/${teamId}/members/add`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: values.email.trim() })
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '添加失败');
      }

      markMembersDirty({ pendingSync: Boolean(result.pending_sync || result.data?.pending_sync) });
      memberForm.resetFields();
      window.showToast?.(result.message || result.data?.message || '成员添加成功', 'success');
      await loadMembers(teamId);
      await syncTeamState(teamId);
      await reloadCurrentPageData();

      if (result.pending_sync || result.data?.pending_sync) {
        scheduleMembersRefresh(teamId);
      }
    } catch (error) {
      window.showToast?.(error.message || '添加失败', 'error');
    } finally {
      setMemberSubmitting(false);
    }
  }

  async function handleDeleteMember(teamId, member) {
    const actionKey = `member-delete-${member.user_id}`;
    setMemberActionLoading(actionKey);
    try {
      const response = await fetch(buildAdminUrl(`/teams/${teamId}/members/${member.user_id}/delete`), {
        method: 'POST'
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '删除失败');
      }

      markMembersDirty();
      window.showToast?.('删除成功', 'success');
      await loadMembers(teamId);
      await syncTeamState(teamId);
      await reloadCurrentPageData();
    } catch (error) {
      window.showToast?.(error.message || '删除失败', 'error');
    } finally {
      setMemberActionLoading('');
    }
  }

  async function handleRevokeInvite(teamId, member) {
    const actionKey = `invite-revoke-${member.email}`;
    setMemberActionLoading(actionKey);
    try {
      const response = await fetch(buildAdminUrl(`/teams/${teamId}/invites/revoke`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: member.email })
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '撤回失败');
      }

      markMembersDirty();
      window.showToast?.('撤回成功', 'success');
      await loadMembers(teamId);
      await syncTeamState(teamId);
      await reloadCurrentPageData();
    } catch (error) {
      window.showToast?.(error.message || '撤回失败', 'error');
    } finally {
      setMemberActionLoading('');
    }
  }

  async function runBatchAction(actionName, endpoint) {
    if (selectedRowKeys.length === 0) {
      window.showToast?.('请选择要操作的 Team', 'warning');
      return;
    }

    try {
      setTableLoading(true);
      window.showToast?.(`正在${actionName}...`, 'info');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedRowKeys.map(id => Number(id)) })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `${actionName}失败`);
      }

      setSelectedRowKeys([]);
      await reloadCurrentPageData();
      window.showToast?.(result.message || `${actionName}成功`, 'success');
    } catch (error) {
      window.showToast?.(error.message || `${actionName}失败`, 'error');
    } finally {
      setTableLoading(false);
    }
  }

  const baseColumns = useMemo(() => [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: value => <Text type="secondary">{value}</Text>
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 280,
      render: (value, record) => (
        <div className="team-list-email-cell">
          <span>{value}</span>
          {record.account_role && record.account_role !== 'account-owner' ? (
            <Tag color="orange" bordered={false}>已降级</Tag>
          ) : null}
        </div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: value => {
        return renderStatusTag(value);
      }
    },
    {
      title: '设备验证',
      dataIndex: 'device_code_auth_enabled',
      key: 'device_code_auth_enabled',
      width: 120,
      render: enabled => (
        <Tag color={enabled ? 'green' : 'default'} bordered={false}>
          {enabled ? '已开启' : '未开启'}
        </Tag>
      )
    },
    {
      title: 'Team 名称',
      dataIndex: 'team_name',
      key: 'team_name',
      width: 180,
      render: value => value || '-'
    },
    {
      title: '成员数',
      key: 'members',
      width: 100,
      render: (_, record) => `${record.current_members}/${record.max_members}`
    },
    {
      title: '订阅计划',
      dataIndex: 'subscription_plan',
      key: 'subscription_plan',
      width: 170,
      render: value => value || '-'
    },
    {
      title: '到期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 180,
      render: value => formatDateTime(value)
    },
    {
      title: '凭证',
      key: 'credential',
      width: 170,
      render: (_, record) => <CredentialCell team={record} />
    },
    {
      title: 'Account ID',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 250,
      render: value => <Text type="secondary">{value || '-'}</Text>
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看成员">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => openMembersModal(record.id, record.email)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEditModal(String(record.id))}
            />
          </Tooltip>
          <Popconfirm
            title="刷新 Team"
            description="确定要刷新此 Team 的信息吗？"
            okText="立即刷新"
            cancelText="取消"
            placement="top"
            onConfirm={() => handleRefreshTeam(record.id)}
          >
            <Tooltip title="刷新">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={teamActionLoading === `refresh-${record.id}`}
              />
            </Tooltip>
          </Popconfirm>
          <Popconfirm
            title="开启设备验证"
            description="确定要为该 Team 开启设备代码身份验证吗？"
            okText="立即开启"
            cancelText="取消"
            placement="top"
            onConfirm={() => handleEnableDeviceAuth(record.id)}
          >
            <Tooltip title="一键开启设备验证">
              <Button
                type="text"
                icon={<SafetyCertificateOutlined />}
                loading={teamActionLoading === `device-auth-${record.id}`}
              />
            </Tooltip>
          </Popconfirm>
          <Popconfirm
            title="删除 Team"
            description={`确定要删除 Team "${record.email}" 吗？此操作不可恢复。`}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            placement="top"
            onConfirm={() => handleDeleteTeam(record.id)}
          >
            <Tooltip title="删除">
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                loading={teamActionLoading === `delete-${record.id}`}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ], [teamActionLoading]);

  const columns = baseColumns.filter(column => visibleColumns.includes(column.key));

  const columnSelector = (
    <div className="team-list-column-selector">
      <Checkbox.Group
        value={visibleColumns}
        onChange={values => {
          const nextValues = baseColumns
            .map(column => column.key)
            .filter(key => values.includes(key));
          setVisibleColumns(nextValues);
        }}
      >
        <Space direction="vertical">
          {baseColumns.map(column => (
            <Checkbox key={column.key} value={column.key}>
              {column.title}
            </Checkbox>
          ))}
        </Space>
      </Checkbox.Group>
    </div>
  );

  const importBatchColumns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: '状态',
      dataIndex: 'success',
      key: 'success',
      width: 100,
      render: success => (
        <Tag color={success ? 'green' : 'red'} bordered={false}>
          {success ? '成功' : '失败'}
        </Tag>
      )
    },
    {
      title: '消息',
      key: 'message',
      render: (_, record) => record.success ? (record.message || '导入成功') : record.error
    }
  ];

  const joinedMemberColumns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: role => {
        const meta = MEMBER_ROLE_MAP[role] || { label: role || '未知', color: 'default' };
        return <Tag color={meta.color} bordered={false}>{meta.label}</Tag>;
      }
    },
    {
      title: '加入时间',
      dataIndex: 'added_at',
      key: 'added_at',
      width: 180,
      render: value => formatDateTime(value)
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        record.role === 'account-owner' ? (
          <Text type="secondary">不可删除</Text>
        ) : (
          <Popconfirm
            title="删除成员"
            description={`确定要删除成员 "${record.email}" 吗？`}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            placement="topRight"
            onConfirm={() => handleDeleteMember(currentMembersTeam?.id, record)}
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={memberActionLoading === `member-delete-${record.user_id}`}
            >
              删除
            </Button>
          </Popconfirm>
        )
      )
    }
  ];

  const invitedMemberColumns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: '角色',
      key: 'role',
      width: 120,
      render: () => <Tag bordered={false}>成员</Tag>
    },
    {
      title: '邀请时间',
      dataIndex: 'added_at',
      key: 'added_at',
      width: 180,
      render: value => formatDateTime(value)
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Popconfirm
          title="撤回邀请"
          description={`确定要撤回对 "${record.email}" 的邀请吗？`}
          okText="确认撤回"
          cancelText="取消"
          placement="topRight"
          onConfirm={() => handleRevokeInvite(currentMembersTeam?.id, record)}
        >
          <Button
            size="small"
            icon={<UndoOutlined />}
            loading={memberActionLoading === `invite-revoke-${record.email}`}
          >
            撤回
          </Button>
        </Popconfirm>
      )
    }
  ];

  const importTabItems = [
    {
      key: 'single',
      label: '单个导入',
      children: (
        <Form
          className="team-list-import-form"
          form={singleImportForm}
          layout="vertical"
          onFinish={handleSingleImport}
        >
          <Form.Item name="access_token" label="Access Token (AT)" extra={IMPORT_FIELD_EXTRAS.access_token}>
            <Input placeholder="eyJhbGciOiJSUzI1Ni..." />
          </Form.Item>
          <Form.Item name="session_token" label="Session Token" extra={IMPORT_FIELD_EXTRAS.session_token}>
            <Input placeholder="eyJ..." />
          </Form.Item>
          <Form.Item name="client_id" label="Client ID" extra={IMPORT_FIELD_EXTRAS.client_id}>
            <Input placeholder="Client ID" />
          </Form.Item>
          <Form.Item name="refresh_token" label="Refresh Token (RT)" extra={IMPORT_FIELD_EXTRAS.refresh_token}>
            <Input placeholder="rt-..." />
          </Form.Item>
          <Form.Item name="email" label="邮箱" extra={IMPORT_FIELD_EXTRAS.email}>
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="account_id" label="Account ID" extra={IMPORT_FIELD_EXTRAS.account_id}>
            <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Form.Item>
        </Form>
      )
    },
    {
      key: 'batch',
      label: '批量导入',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text className="team-list-modal-label">批量导入内容</Text>
            <TextArea
              rows={8}
              value={batchImportText}
              placeholder="一行一个 AT Token..."
              onChange={event => setBatchImportText(event.target.value)}
            />
          </div>

          {(batchImportSubmitting || batchImportState.stage || batchImportState.results.length > 0) ? (
            <div className="team-list-progress-card">
              <div className="team-list-progress-row">
                <Text>{batchImportState.stage || '准备导入...'}</Text>
                <Text type="secondary">{batchImportState.percent}%</Text>
              </div>
              <Progress percent={batchImportState.percent} showInfo={false} />
              <Space size={16}>
                <Text>成功: <Text strong>{batchImportState.successCount}</Text></Text>
                <Text>失败: <Text strong>{batchImportState.failedCount}</Text></Text>
              </Space>
              {batchImportState.summary ? (
                <Text type="secondary">{batchImportState.summary}</Text>
              ) : null}
            </div>
          ) : null}

          {batchImportState.results.length > 0 ? (
            <div className="team-list-modal-section">
              <div className="team-list-section-header">
                <Title level={5}>导入详情</Title>
              </div>
              <Table
                size="small"
                pagination={false}
                rowKey={(record, index) => `${record.email || 'unknown'}-${index}`}
                columns={importBatchColumns}
                dataSource={batchImportState.results}
                scroll={{ y: 280 }}
              />
            </div>
          ) : null}
        </Space>
      )
    }
  ];

  const importFooter = [
    <Button
      key="cancel"
      onClick={() => {
        setImportModalOpen(false);
        resetImportState();
      }}
    >
      取消
    </Button>,
    importTab === 'single' ? (
      <Button
        key="submit-single"
        type="primary"
        loading={singleImportSubmitting}
        onClick={() => singleImportForm.submit()}
      >
        导入
      </Button>
    ) : (
      <Button
        key="submit-batch"
        type="primary"
        loading={batchImportSubmitting}
        onClick={handleBatchImport}
      >
        批量导入
      </Button>
    )
  ];

  const membersFooter = [
    <Button key="close" onClick={closeMembersModal}>
      关闭
    </Button>
  ];

  return (
    <>
      {confirmState ? (
        <Popconfirm
          open
          title={confirmState.title}
          description={confirmState.content || null}
          okText={confirmState.okText}
          cancelText={confirmState.cancelText}
          okButtonProps={confirmState.danger ? { danger: true } : undefined}
          placement="top"
          onConfirm={() => {
            confirmState.resolve?.(true);
            setConfirmState(null);
          }}
          onCancel={() => {
            confirmState.resolve?.(false);
            setConfirmState(null);
          }}
          onOpenChange={open => {
            if (!open) {
              confirmState.resolve?.(false);
              setConfirmState(null);
            }
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: `${confirmState.rect?.top ?? Math.max(window.innerHeight / 2 - 18, 24)}px`,
              left: `${confirmState.rect?.left ?? Math.max(window.innerWidth / 2 - 24, 24)}px`,
              width: `${confirmState.rect?.width ?? 48}px`,
              height: `${confirmState.rect?.height ?? 36}px`,
              opacity: 0,
              pointerEvents: 'none',
              zIndex: 1200
            }}
          />
        </Popconfirm>
      ) : null}

      <div className="team-list-island">
        <div className="team-list-header">
          <div className="team-list-header-title">
            <h3>Team 列表</h3>
          </div>
          <Space wrap size={[12, 12]}>
            {selectedRowKeys.length > 0 ? (
              <Badge count={selectedRowKeys.length} color="#5b67f1">
                <Space wrap className="team-list-batch-actions">
                  <Popconfirm
                    title="批量刷新"
                    description={`确定要对选中的 ${selectedRowKeys.length} 个 Team 执行“批量刷新”吗？`}
                    okText="确认执行"
                    cancelText="取消"
                    placement="top"
                    onConfirm={() => runBatchAction('批量刷新', buildAdminUrl('/teams/batch-refresh'))}
                  >
                    <Button>批量刷新</Button>
                  </Popconfirm>
                  <Popconfirm
                    title="批量开启验证"
                    description={`确定要对选中的 ${selectedRowKeys.length} 个 Team 执行“批量开启验证”吗？`}
                    okText="确认执行"
                    cancelText="取消"
                    placement="top"
                    onConfirm={() => runBatchAction('批量开启验证', buildAdminUrl('/teams/batch-enable-device-auth'))}
                  >
                    <Button>批量开启验证</Button>
                  </Popconfirm>
                  <Popconfirm
                    title="批量删除"
                    description={`确定要删除选中的 ${selectedRowKeys.length} 个 Team 吗？此操作不可恢复。`}
                    okText="确认删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    placement="top"
                    onConfirm={() => runBatchAction('批量删除', buildAdminUrl('/teams/batch-delete'))}
                  >
                    <Button danger>批量删除</Button>
                  </Popconfirm>
                </Space>
              </Badge>
            ) : null}
            <Select
              value={statusFilter}
              options={STATUS_OPTIONS}
              suffixIcon={<FilterOutlined />}
              style={{ width: 160 }}
              onChange={value => {
                window.location.href = buildNextUrl({
                  search: appliedSearch,
                  statusFilter: value,
                  page: 1,
                  perPage: paginationState.per_page
                });
              }}
            />
            <Input.Search
              allowClear
              value={searchValue}
              placeholder="搜索邮箱 / Account ID"
              style={{ width: 220 }}
              onChange={event => setSearchValue(event.target.value)}
              onSearch={value => {
                window.location.href = buildNextUrl({
                  search: value.trim(),
                  statusFilter,
                  page: 1,
                  perPage: paginationState.per_page
                });
              }}
            />
            <Popover content={columnSelector} trigger="click" placement="bottomRight">
              <Button icon={<SettingOutlined />}>列设置</Button>
            </Popover>
            <Button
              type="primary"
              icon={<PlusCircleOutlined />}
              onClick={() => window.showModal?.('importTeamModal')}
            >
              导入 Team
            </Button>
          </Space>
        </div>

        <Table
          rowKey="id"
          loading={tableLoading}
          dataSource={teamsData}
          columns={columns}
          locale={{
            emptyText: (
              <Empty
                description="暂无 Team 数据"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: keys => setSelectedRowKeys(keys)
          }}
          scroll={{ x: 1200 }}
          pagination={{
            current: paginationState.current_page,
            pageSize: paginationState.per_page,
            total: paginationState.total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            onChange: (page, pageSize) => {
              window.location.href = buildNextUrl({
                search: appliedSearch,
                statusFilter,
                page,
                perPage: pageSize
              });
            }
          }}
        />
      </div>

      <Modal
        open={editModalOpen}
        width={860}
        maskClosable
        keyboard
        destroyOnClose={false}
        confirmLoading={editSaving}
        styles={{ body: { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingTop: 20 } }}
        onCancel={() => {
          setEditModalOpen(false);
          setEditParseOpen(false);
          setEditParseError('');
          setEditParseValue('');
        }}
        onOk={() => editForm.submit()}
        okText="保存修改"
        cancelText="取消"
        title={(
          <div className="team-edit-modal-title">
            <div className="team-edit-modal-title-copy">
              <span className="team-edit-modal-title-text">编辑 Team 信息</span>
              <Text type="secondary" className="team-edit-modal-subtitle">
                {editTeamNameValue || editAccountIdValue || '调整凭证与 Team 基础信息'}
              </Text>
            </div>
            <Button size="small" onClick={() => setEditParseOpen(true)}>
              一键解析
            </Button>
          </div>
        )}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleSaveEdit}
          disabled={editLoading}
        >
          <div className="team-edit-overview">
            <div className="team-edit-overview-card">
              <span className="team-edit-overview-label">账号角色</span>
              <strong>{editAccountRoleValue || '未知'}</strong>
            </div>
            <div className="team-edit-overview-card">
              <span className="team-edit-overview-label">设备验证</span>
              <strong>{editDeviceAuthValue || '未开启'}</strong>
            </div>
            <div className="team-edit-overview-card">
              <span className="team-edit-overview-label">当前状态</span>
              <div>{renderStatusTag(editStatusValue)}</div>
            </div>
          </div>

          <div className="team-edit-grid">
          <Form.Item className="team-edit-grid-span-2" name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }]}>
            <Input />
          </Form.Item>
          <Form.Item className="team-edit-grid-span-2" label="Access Token (AT)" required extra="Access Token 仍会优先用于当前请求，点右侧按钮可立即刷新。">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item
                name="access_token"
                noStyle
                rules={[{ required: true, message: '请输入 Access Token' }]}
              >
                <Input />
              </Form.Item>
              <Button loading={editRefreshingToken} onClick={handleRefreshAccessToken}>
                刷新
              </Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item className="team-edit-grid-span-2" name="session_token" label="Session Token">
            <Input />
          </Form.Item>
          <Form.Item name="client_id" label="Client ID">
            <Input />
          </Form.Item>
          <Form.Item name="refresh_token" label="Refresh Token (RT)">
            <Input />
          </Form.Item>
          <Form.Item name="account_id" label="Account ID" rules={[{ required: true, message: '请输入 Account ID' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="team_name" label="Team 名称">
            <Input />
          </Form.Item>
          <Form.Item name="max_members" label="最大成员数" rules={[{ required: true, message: '请输入最大成员数' }]}>
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { value: 'active', label: '活跃 (Active)' },
                { value: 'full', label: '已满 (Full)' },
                { value: 'expired', label: '已过期 (Expired)' },
                { value: 'error', label: '异常 (Error)' },
                { value: 'banned', label: '已封禁 (Banned)' }
              ]}
            />
          </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        open={editParseOpen}
        width={640}
        maskClosable
        keyboard
        footer={null}
        title="解析 JSON"
        styles={{ body: { maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' } }}
        onCancel={() => setEditParseOpen(false)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text>粘贴 auth/session JSON</Text>
          <TextArea
            rows={6}
            value={editParseValue}
            onChange={event => setEditParseValue(event.target.value)}
            placeholder={IMPORT_JSON_PLACEHOLDER}
          />
          {editParseError ? <Text type="danger">{editParseError}</Text> : null}
          <Space wrap>
            <Button type="primary" onClick={handleParseEditJson}>
              解析并填充
            </Button>
            <Button
              onClick={() => {
                window.open('https://chatgpt.com/api/auth/session', '_blank', 'noopener');
                window.showToast?.('已打开 ChatGPT API 页面，请复制返回的 JSON 数据', 'info');
              }}
            >
              打开 API 页面
            </Button>
            <Button
              onClick={() => {
                setEditParseValue('');
                setEditParseError('');
              }}
            >
              清空解析框
            </Button>
          </Space>
        </Space>
      </Modal>

      <Modal
        open={membersModalOpen}
        width={900}
        maskClosable
        keyboard
        footer={membersFooter}
        title={(
          <div className="team-list-members-title">
            <span>Team 成员管理</span>
            {currentMembersTeam?.email ? (
              <Text type="secondary" className="team-list-modal-subtitle">{currentMembersTeam.email}</Text>
            ) : null}
          </div>
        )}
        styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
        onCancel={closeMembersModal}
      >
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <div className="team-list-modal-section">
            <div className="team-list-section-header">
              <Title level={5}>新增成员邮箱</Title>
            </div>
            <Form form={memberForm} layout="vertical" onFinish={handleAddMember}>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item
                  name="email"
                  noStyle
                  rules={[
                    { required: true, message: '请输入邮箱' },
                    { type: 'email', message: '请输入有效邮箱' }
                  ]}
                >
                  <Input placeholder="user@example.com" />
                </Form.Item>
                <Button type="primary" icon={<UserAddOutlined />} htmlType="submit" loading={memberSubmitting}>
                  添加
                </Button>
              </Space.Compact>
            </Form>
          </div>

          <div className="team-list-modal-section">
            <div className="team-list-section-header team-list-section-header-success">
              <Title level={5}>已加入成员</Title>
            </div>
            <Table
              size="small"
              loading={membersLoading}
              pagination={false}
              rowKey={record => record.user_id || record.email}
              columns={joinedMemberColumns}
              dataSource={joinedMembers}
              locale={{ emptyText: '暂无已加入成员' }}
            />
          </div>

          <div className="team-list-modal-section">
            <div className="team-list-section-header team-list-section-header-warning">
              <Title level={5}>待加入成员（邀请中）</Title>
            </div>
            <Table
              size="small"
              loading={membersLoading}
              pagination={false}
              rowKey={record => record.email}
              columns={invitedMemberColumns}
              dataSource={invitedMembers}
              locale={{ emptyText: '暂无待加入成员' }}
            />
          </div>
        </Space>
      </Modal>
    </>
  );
}

export default TeamListIsland;
