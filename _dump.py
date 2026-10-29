import sys
p = r'c:\Users\XXX\Desktop\test\server.js'
with open(p, encoding='utf-8') as f:
    lines = f.readlines()
for i in range(229, min(330, len(lines))):
    print(f"{i+1}: {lines[i].rstrip()}")
