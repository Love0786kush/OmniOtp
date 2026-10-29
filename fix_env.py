import os

# Read current .env
with open('c:\\\\Users\\\\XXX\\\\Desktop\\\\test\\\\.env', 'rb') as f:
    content = f.read()

# Find the position after the existing content and append
new_content = b'HTTPSMS_API_KEY=pk_JJwFKTe9zE8E_dwF-GsMjbo440Dnz-QC3ZubkHKMhGYzIIYQrC_6NK7FHr1d0fLo\nHTTPSMS_FROM=7852081659\n\nSUPABASE_URL=https://your-project.supabase.co\nSUPABASE_KEY=your-service-role-key-or-anon-key-here\n'

# Write new content (overwrite)
with open('c:\\\\Users\\\\XXX\\\\Desktop\\\\test\\\\.env', 'wb') as f:
    f.write(new_content)

print(' .env file updated')