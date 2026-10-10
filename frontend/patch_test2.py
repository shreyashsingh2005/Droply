import os
import re

code = open('src/services/webrtc.ts', 'r', encoding='utf-8').read()
code = code.replace("export let cachedIceConfig:", "let cachedIceConfig:")
code += "\nexport function resetIceConfigForTesting() { cachedIceConfig = undefined; }\n"
open('src/services/webrtc.ts', 'w', encoding='utf-8').write(code)

test_code = open('src/services/webrtc.test.ts', 'r', encoding='utf-8').read()
test_code = test_code.replace("(webrtcModule as any).cachedIceConfig = undefined;", "webrtcModule.resetIceConfigForTesting();")
open('src/services/webrtc.test.ts', 'w', encoding='utf-8').write(test_code)
