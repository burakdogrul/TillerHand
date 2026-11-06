// Ready-made providers for the panel (docs/workflow/models.md). Every entry answers Anthropic Messages with a Bearer key, per the provider's own docs on checkedAt.
// Prices are USD per million tokens. No price means the provider's page could not be read: the user types it. The panel's update button refreshes these lists (provider-models.mjs); a model id can always be typed by hand.
const CHECKED = '2026-11-06';

export const PRESETS = {
  openrouter: {
    label: 'OpenRouter', url: 'https://openrouter.ai/api', keyUrl: 'https://openrouter.ai/settings/keys', modelsUrl: 'https://openrouter.ai/models',
    listUrl: 'https://openrouter.ai/api/v1/models', listNeedsKey: false, checkedAt: CHECKED,
    models: [{ id: 'deepseek/deepseek-v4.1-flash', input: 0.05, output: 0.57, context: 1048576 }, { id: 'z-ai/glm-5.3-flashx', input: 0.37, output: 1.25, context: 1048576 }, { id: 'moonshotai/kimi-k3.1-pro', input: 2, output: 10, context: 1048576 }],
  },
  deepseek: {
    label: 'DeepSeek', url: 'https://api.deepseek.com/anthropic', keyUrl: 'https://platform.deepseek.com/api_keys', modelsUrl: 'https://api-docs.deepseek.com/quick_start/pricing', listUrl: 'https://api.deepseek.com/models', listNeedsKey: true, checkedAt: CHECKED,
    // Peak prices: off-peak is half
    models: [{ id: 'deepseek-flash', input: 0.3, output: 1.2, context: 1000000 }, { id: 'deepseek-v4-pro', input: 1.32, output: 3.96, context: 1000000 }],
  },
  kimi: {
    label: 'Kimi (Moonshot)', url: 'https://api.moonshot.ai/anthropic', keyUrl: 'https://platform.kimi.ai/console/api-keys', modelsUrl: 'https://platform.kimi.ai/docs/models', listUrl: 'https://api.moonshot.ai/v1/models', listNeedsKey: true, checkedAt: CHECKED,
    models: [{ id: 'kimi-k3.1-pro', context: 1048576 }, { id: 'kimi-k3', context: 1048576 }, { id: 'kimi-k2.7-code', context: 262144 }],
  },
  zai: {
    label: 'Z.ai (GLM)', url: 'https://api.z.ai/api/anthropic', keyUrl: 'https://z.ai/manage-apikey/apikey-list', modelsUrl: 'https://docs.z.ai/guides/overview/pricing', listUrl: 'https://api.z.ai/api/paas/v4/models', listNeedsKey: true, checkedAt: CHECKED,
    models: [{ id: 'glm-5.3', input: 1.4, output: 4.4 }, { id: 'glm-5.3-flashx', input: 0.37, output: 1.25 }, { id: 'glm-5.3-flash', input: 0.15, output: 0.5 }],
  },
  minimax: {
    // The docs name no key page: this is the console the key is made in
    label: 'MiniMax', url: 'https://api.minimax.io/anthropic', keyUrl: 'https://platform.minimax.io', modelsUrl: 'https://platform.minimax.io/docs/pricing/overview', listUrl: 'https://api.minimax.io/anthropic/v1/models', listNeedsKey: true, checkedAt: CHECKED,
    models: [{ id: 'MiniMax-M3.1-Flash', context: 1000000 }, { id: 'MiniMax-M3', context: 1000000 }],
  },
  qwen: {
    label: 'Qwen (Alibaba)', url: 'https://dashscope-intl.aliyuncs.com/apps/anthropic', keyUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key', modelsUrl: 'https://www.alibabacloud.com/help/en/model-studio/claude-code', listUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', listNeedsKey: true, checkedAt: CHECKED,
    models: [{ id: 'qwen3.7-max' }, { id: 'qwen3.6-flash' }],
  },
};
