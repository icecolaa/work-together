import {execFileSync} from 'node:child_process';

export const API_BASE = 'https://gitee.com/api/v5';
export class GiteeError extends Error {
  constructor(message, {status, uncertain = false} = {}) { super(message); this.status = status; this.uncertain = uncertain; }
}
export class GiteeClient {
  constructor({owner, repo, token, fetchImpl = fetch, baseUrl = API_BASE}) {
    if (!token) throw Error('未设置 Gitee API 令牌环境变量');
    this.owner = owner; this.repo = repo; this.token = token; this.fetch = fetchImpl; this.baseUrl = baseUrl;
    this.repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }
  async request(method, suffix, {query = {}, body} = {}) {
    const url = new URL(this.baseUrl + suffix);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers = {Authorization: 'Bearer ' + this.token, Accept: 'application/json'};
    let encoded;
    if (body) {
      encoded = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) if (value !== undefined && value !== null) encoded.set(key, String(value));
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    let response;
    try { response = await this.fetch(url, {method, headers, body: encoded, redirect: 'error', signal: AbortSignal.timeout(20000)}); }
    catch { throw new GiteeError(`Gitee ${method} 请求未取得确定响应；先对账，禁止盲目重发`, {uncertain: method !== 'GET'}); }
    if (!response.ok) throw new GiteeError(`Gitee ${method} ${suffix} 返回 HTTP ${response.status}`, {status: response.status, uncertain: method !== 'GET' && response.status >= 500});
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch { throw new GiteeError('Gitee 响应不是合法 JSON，需对账', {status: response.status, uncertain: method !== 'GET'}); }
  }
  user() { return this.request('GET', '/user'); }
  repository() { return this.request('GET', this.repoPath); }
  branch(name) { return this.request('GET', this.repoPath + '/branches/' + encodeURIComponent(name)); }
  async branchOrNull(name) { try { return await this.branch(name); } catch (e) { if (e.status === 404) return null; throw e; } }
  async list(suffix, query = {}) {
    const result = [];
    for (let page = 1; page <= 50; page++) {
      const batch = await this.request('GET', suffix, {query: {...query, page, per_page: 100}});
      if (!Array.isArray(batch)) throw Error('Gitee 列表响应不是数组');
      result.push(...batch);
      if (batch.length < 100) return result;
    }
    throw Error('Gitee 列表超过扫描上限，停止创建以防重复，需人工核对');
  }
  issues() { return this.list(this.repoPath + '/issues', {state: 'all', sort: 'created', direction: 'desc'}); }
  issue(number) { return this.request('GET', this.repoPath + '/issues/' + encodeURIComponent(number)); }
  createIssue(body) { return this.request('POST', `/repos/${encodeURIComponent(this.owner)}/issues`, {body: {repo: this.repo, ...body}}); }
  updateIssue(number, body) { return this.request('PATCH', `/repos/${encodeURIComponent(this.owner)}/issues/${encodeURIComponent(number)}`, {body: {repo: this.repo, ...body}}); }
  pulls() { return this.list(this.repoPath + '/pulls', {state: 'all', sort: 'created', direction: 'desc'}); }
  pull(number) { return this.request('GET', this.repoPath + '/pulls/' + encodeURIComponent(number)); }
  createPull(body) { return this.request('POST', this.repoPath + '/pulls', {body}); }
  updatePull(number, body) { return this.request('PATCH', this.repoPath + '/pulls/' + encodeURIComponent(number), {body}); }
}

export function parseGiteeRemote(value) {
  const match = value.match(/^(?:https:\/\/gitee\.com\/|git@gitee\.com:|ssh:\/\/git@gitee\.com\/)([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?\/?$/i);
  return match ? {owner: match[1], repo: match[2]} : null;
}
export function detectGitee(root) {
  const output = execFileSync('git', ['remote', 'get-url', '--push', '--all', 'origin'], {cwd: root, encoding: 'utf8', windowsHide: true});
  const matches = output.trim().split(/\r?\n/).map(parseGiteeRemote).filter(Boolean);
  const unique = [...new Map(matches.map(m => [m.owner + '/' + m.repo, m])).values()];
  if (unique.length !== 1) throw Error('origin 必须有唯一 Gitee 推送目标，或在 init 中显式提供配置文件');
  return unique[0];
}
export function validateGiteeConfig(input) {
  const config = {tokenEnv: 'GITEE_OPEN_API', closeIssuesOnMerge: true, ...input};
  for (const key of ['owner', 'repo']) if (typeof config[key] !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(config[key]) || /^\.{1,2}$/.test(config[key])) throw Error('Gitee owner/repo 不合法');
  if (typeof config.base !== 'string' || !config.base || config.base.startsWith('-') || /[\s~^:?*\[\\]|\.\.|@\{|\/\//.test(config.base) || config.base.endsWith('/') || config.base.endsWith('.lock')) throw Error('Gitee base 分支不合法');
  if (!/^[A-Z_][A-Z0-9_]*$/.test(config.tokenEnv)) throw Error('tokenEnv 必须是环境变量名，不能填写令牌');
  if (typeof config.closeIssuesOnMerge !== 'boolean') throw Error('closeIssuesOnMerge 必须为布尔值');
  if (Object.keys(config).some(k => !['owner', 'repo', 'base', 'tokenEnv', 'closeIssuesOnMerge'].includes(k))) throw Error('Gitee 配置含未知字段；令牌只从环境读取');
  return config;
}
export const branchSha = branch => typeof branch?.commit === 'string' ? branch.commit : branch?.commit?.sha;
export const pullSha = pull => typeof pull?.head === 'object' ? pull.head.sha : null;
export const isMerged = pull => pull?.state === 'merged' || !!pull?.merged_at;
