import os

test_code = open('src/services/webrtc.test.ts', 'r', encoding='utf-8').read()

# Remove the unused import
test_code = test_code.replace("// We need to reset cached config manually by casting as we didn't export a reset method\nimport * as webrtcModule from './webrtc';\n", "")
test_code = test_code.replace("import * as webrtcModule from './webrtc';\n", "")

# Now inject the test properly!
# Let's search for "describe('sender negotiation', () => {"
import re
new_tests = '''
  describe('ice server loading', () => {
    it('reports signaling-unreachable when fetch fails', async () => {
      g.fetch = vi.fn(async () => { throw new Error('network down'); });
      // Reset cache manually by mutating the exported module member, but here we can just import it.
      const webrtcModule = await import('./webrtc');
      (webrtcModule as any).cachedIceConfig = undefined;

      const p = new PeerConnection('room', 'sender', {});
      await p.start();
      await flush();
      expect(p.currentState).toBe('failed');
    });

    it('reports signaling-unreachable when fetch returns 500', async () => {
      g.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
      const webrtcModule = await import('./webrtc');
      (webrtcModule as any).cachedIceConfig = undefined;

      const p = new PeerConnection('room', 'sender', {});
      await p.start();
      await flush();
      expect(p.currentState).toBe('failed');
    });
  });

  describe('sender negotiation', () => {
'''

test_code = re.sub(r"describe\('sender negotiation',\s*\(\)\s*=>\s*\{", new_tests.strip(), test_code)

open('src/services/webrtc.test.ts', 'w', encoding='utf-8').write(test_code)
