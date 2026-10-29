import os

# Replace 918290866520 with 7852081659 in all relevant files
files = [
    'c:\\\\Users\\\\XXX\\\\Desktop\\\\test\\\\index.html',
    'c:\\\\Users\\\\XXX\\\\Desktop\\\\test\\\\js\\\\app.js'
]

for filepath in files:
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace the phone number
        new_content = content.replace('918290866520', '7852081659')
        
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'Updated: {filepath}')
        else:
            print(f'No changes needed: {filepath}')
    else:
        print(f'File not found: {filepath}')

print('\\nReplacement complete!')