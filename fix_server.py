import re

with open('c:\\\\Users\\\\XXX\\\\Desktop\\\\test\\\\server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace SESSIONS.save session block
old_block = """    # Save session
    SESSIONS.set(sessionId, {
      sessionId,
      phone,
      otp,
      expiresAt,
      attemptsLeft: 3,
      verified: false,
      createdAt: new Date()
    });

    # Sync session to Supabase
    await syncToSupabase('omni_sessions', {"""

new_block = """# Save session via Supabase (or in-memory fallback)
    const savedSession = await saveSession(sessionId, phone, otp, expiresAt, 3);

    # Sync session to Supabase
    await syncToSupabase('omni_sessions', {"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('c:\\\\Users\\\\XXX\\\\Desktop\\\\test\\\\server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replacement successful')
else:
    print('Pattern not found - trying alternative')
    # Try with different pattern
    old_block2 = """    // Save session
    SESSIONS.set(sessionId, {
      sessionId,
      phone,
      otp,
      expiresAt,
      attemptsLeft: 3,
      verified: false,"""
    if old_block2 in content:
        content = content.replace(old_block2, new_block)
        with open('c:\\\\Users\\\\XXX\\\\Desktop\\\\test\\\\server.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Replacement successful (alternative pattern)')
    else:
        print('Alternative pattern not found either')