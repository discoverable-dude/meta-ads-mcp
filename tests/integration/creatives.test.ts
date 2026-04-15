// tests/integration/creatives.test.ts
import { describe, it, expect, vi } from 'vitest';
import { creativesTools } from '../../src/tools/creatives.js';

function mkCtx() {
  return {
    client: { get: vi.fn(async () => ({ data: [{ id: 'cr1' }] })), post: vi.fn(async () => ({ id: 'cr2' })), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
  } as any;
}

describe('creatives', () => {
  it('list_creatives uses default account', async () => {
    const ctx = mkCtx();
    const tool = creativesTools.find(t => t.name === 'list_creatives')!;
    await tool.handler({}, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/act_1/adcreatives', expect.any(Object));
  });

  it('upload_creative with image_url posts object_story_spec', async () => {
    const ctx = mkCtx();
    const tool = creativesTools.find(t => t.name === 'upload_creative')!;
    await tool.handler({
      name: 'c',
      page_id: 'p1',
      image_url: 'https://example.com/a.jpg',
      message: 'Hi',
      link: 'https://example.com',
    }, ctx);
    expect(ctx.client.post).toHaveBeenCalledWith('/act_1/adcreatives', expect.objectContaining({
      name: 'c',
      object_story_spec: expect.objectContaining({ page_id: 'p1' }),
    }));
  });
});
