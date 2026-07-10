import { describe, it, expect } from 'vitest';
import { fakeTable, fakePorts } from './fakes';

describe('fakes', () => {
  it('table roundtrip and update-by-id', () => {
    const t = fakeTable<{ id: string; v: number }>();
    t.insert({ id: 'a', v: 1 });
    t.update({ id: 'a', v: 2 });
    expect(t.byId('a')!.v).toBe(2);
    expect(() => t.update({ id: 'zz', v: 0 })).toThrow();
  });
  it('ports produce deterministic ids and audit trail', () => {
    const p = fakePorts();
    expect(p.uuid()).toBe('uuid-1');
    p.repos.audit.append({ timestamp: '', userId: 'u', action: 'a', entity: 'e', entityId: '1', detail: '' });
    expect(p.auditRows).toHaveLength(1);
  });
});
