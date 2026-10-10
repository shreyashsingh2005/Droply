import os

code = open('src/services/webrtc.ts', 'r', encoding='utf-8').read()
code = code.replace("if (cachedIceConfig) return cachedIceConfig;", "if (cachedIceConfig) { console.log('CACHED'); return cachedIceConfig; } else { console.log('NOT CACHED'); }")
open('src/services/webrtc.ts', 'w', encoding='utf-8').write(code)
