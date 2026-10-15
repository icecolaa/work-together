export const ZCODE_DEFAULTS = { mode: 'yolo', model: 'GLM-5.3-Flash', reasoningLevel: 'max' };

export function creditRate(model) {
  const value = model.credits;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.trim().match(/^(?:[x×]\s*)?(\d+(?:\.\d+)?)\s*(?:credits?)?$/i);
  return match ? Number(match[1]) : null;
}

export function selectWorkBuddyModel(models, requested) {
  const eligible = models.filter(m => m.supportsToolCall === true && !m.disabled);
  if (requested) {
    const exact = eligible.find(m => m.id === requested);
    if (!exact) throw Error(`WorkBuddy 模型不可用：${requested}`);
    return { id: exact.id, rate: creditRate(exact), policy: 'explicit' };
  }
  const priced = eligible.map(m => ({ m, rate: creditRate(m) })).filter(x => x.rate !== null);
  if (!priced.length) throw Error('WorkBuddy 未提供可确认的模型费率；不能把 Auto 当作免费模型');
  const preference = ['step-5-preview', 'deepseek-v4.1-flash', 'hy3'];
  const rank = id => { const index = preference.indexOf(id); return index < 0 ? 999 : index; };
  priced.sort((a, b) => a.rate - b.rate || rank(a.m.id) - rank(b.m.id));
  const { m, rate } = priced[0];
  return { id: m.id, rate, policy: rate === 0 ? 'free-first' : 'lowest-known-rate', checkedAt: new Date().toISOString() };
}

export function selectZCodeModel(view, requested = ZCODE_DEFAULTS.model) {
  const providers = view.providers || [];
  const preferred = view.preferredSelection?.providerId;
  const available = providers.filter(p => p.models?.some(m => m.modelId === requested && m.config?.enabled !== false));
  const provider = available.find(p => p.providerId === preferred) || available.find(p => p.providerId.startsWith('account:')) || available[0];
  if (!provider) throw Error(`ZCode 模型不可用：${requested}；未替换为其他模型`);
  const model = provider.models.find(m => m.modelId === requested);
  const levels = model.config?.reasoningLevels;
  const reasoningLevel = levels?.includes(ZCODE_DEFAULTS.reasoningLevel) ? ZCODE_DEFAULTS.reasoningLevel : levels?.[0];
  return { providerId: provider.providerId, modelId: requested, ...(reasoningLevel ? { options: { reasoningLevel } } : {}) };
}
