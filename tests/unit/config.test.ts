import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env.META_ADS_MCP_CONFIRM_THRESHOLD;
    delete process.env.META_ADS_MCP_GRAPH_VERSION;
    delete process.env.META_ADS_MCP_LOG_LEVEL;
    delete process.env.META_ADS_MCP_CREDENTIALS_DIR;
  });

  it('returns defaults', () => {
    const c = loadConfig();
    expect(c.confirmThresholdCents).toBe(3000);
    expect(c.graphVersion).toBe('v21.0');
    expect(c.logLevel).toBe('info');
    expect(c.credentialsDir).toMatch(/\.meta-ads-mcp$/);
  });

  it('honors env overrides', () => {
    process.env.META_ADS_MCP_CONFIRM_THRESHOLD = '5000';
    process.env.META_ADS_MCP_GRAPH_VERSION = 'v22.0';
    expect(loadConfig().confirmThresholdCents).toBe(5000);
    expect(loadConfig().graphVersion).toBe('v22.0');
  });
});
