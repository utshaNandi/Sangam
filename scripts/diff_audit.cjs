#!/usr/bin/env node
/**
 * Sangam Repository Security Scanner (scripts/diff_audit.cjs)
 *
 * Scans git changes (staged diff by default, working tree, or all tracked files)
 * for secrets, credentials, API keys, private keys, service account JSON files, and tokens.
 *
 * Modes:
 *   node scripts/diff_audit.cjs          # Scans git staged diff (pre-commit default)
 *   node scripts/diff_audit.cjs --staged # Explicitly scans git staged diff
 *   node scripts/diff_audit.cjs --all    # Scans all tracked repository files (CI check)
 *   node scripts/diff_audit.cjs --check  # Scans both staged and working tree modifications
 *   node scripts/diff_audit.cjs --test   # Self-tests detection logic with synthetic dummy vectors
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Forbidden credential files that should NEVER be tracked in Git
const FORBIDDEN_FILE_RULES = [
  {
    name: 'Environment Configuration File (.env*)',
    matches: (filename) => {
      const base = path.basename(filename);
      if (base === '.env.example') return false;
      return base === '.env' || base.startsWith('.env.');
    }
  },
  {
    name: 'Firebase / GCP Service Account JSON',
    matches: (filename) => {
      const base = path.basename(filename).toLowerCase();
      return (base.includes('serviceaccount') || base.includes('firebase-adminsdk')) && base.endsWith('.json');
    }
  },
  {
    name: 'Google OAuth Client Secret / Credentials JSON',
    matches: (filename) => {
      const base = path.basename(filename).toLowerCase();
      return (base.startsWith('client_secret') || base === 'credentials.json') && base.endsWith('.json');
    }
  },
  {
    name: 'Private Key / Certificate File (*.pem, *.key, *.p12, *.pfx)',
    matches: (filename) => {
      const ext = path.extname(filename).toLowerCase();
      return ['.pem', '.key', '.pkcs12', '.p12', '.pfx'].includes(ext);
    }
  }
];

// High-confidence regex patterns for credentials and secrets
const SECRET_PATTERNS = [
  {
    id: 'google_api_key',
    name: 'Google API Key (AIza...)',
    regex: /AIza[0-9A-Za-z-_]{35}/g,
    isAllowlisted: (match, line, file) => {
      const lower = line.toLowerCase();
      return (
        lower.includes('dummy') ||
        lower.includes('example') ||
        lower.includes('placeholder') ||
        lower.includes('your_') ||
        lower.includes('fake') ||
        lower.includes('<your-')
      );
    },
    note: 'Firebase client Web API keys identify project config in browsers. Protect backend keys & restrict API access.'
  },
  {
    id: 'private_key_header',
    name: 'RSA/EC/PKCS Private Key Header',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    isAllowlisted: (match, line, file) => false,
    note: 'Never commit private keys to version control.'
  },
  {
    id: 'google_oauth_secret',
    name: 'Google OAuth Client Secret (GOCSPX...)',
    regex: /GOCSPX-[0-9A-Za-z-_]{20,}/g,
    isAllowlisted: (match, line, file) => {
      const lower = line.toLowerCase();
      return (
        lower.includes('test-mock') ||
        lower.includes('dummy') ||
        lower.includes('placeholder') ||
        lower.includes('example')
      );
    },
    note: 'OAuth client secrets must be loaded from server environment variables only.'
  },
  {
    id: 'service_account_private_key',
    name: 'Firebase/GCP Service Account Private Key Field',
    regex: /\"private_key\":\s*\"-----BEGIN/g,
    isAllowlisted: (match, line, file) => false,
    note: 'Service account keys grant administrative access. Store in secret manager or local ignored env.'
  },
  {
    id: 'token_encryption_key',
    name: 'High-Entropy 256-bit Hex Key (TOKEN_ENCRYPTION_KEY)',
    regex: /(?:TOKEN_ENCRYPTION_KEY|ENCRYPTION_KEY|SECRET_KEY)\s*[:=]\s*["']?([a-fA-F0-9]{64})["']?/g,
    isAllowlisted: (match, line, file) => {
      const lower = line.toLowerCase();
      return (
        lower.includes('0123456789abcdef0123456789abcdef') ||
        lower.includes('randombytes') ||
        lower.includes('example') ||
        lower.includes('placeholder') ||
        lower.includes('dummy')
      );
    },
    note: 'Encryption keys must never be hardcoded or committed to git.'
  },
  {
    id: 'stripe_api_key',
    name: 'Stripe / Payment API Secret Key',
    regex: /(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24,}/g,
    isAllowlisted: (match, line, file) => {
      const lower = line.toLowerCase();
      return lower.includes('placeholder') || lower.includes('example') || lower.includes('dummy');
    },
    note: 'Payment provider secret keys must remain server-side only.'
  },
  {
    id: 'github_pat',
    name: 'GitHub Personal Access Token',
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[0-9a-zA-Z]{36,}/g,
    isAllowlisted: (match, line, file) => false,
    note: 'GitHub access tokens grant repository access and must never be exposed.'
  },
  {
    id: 'webhook_url',
    name: 'Slack / Discord Webhook URL',
    regex: /(?:https:\/\/hooks\.slack\.com\/services\/T[0-9a-zA-Z_]+\/B[0-9a-zA-Z_]+\/[0-9a-zA-Z_]+|https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+)/g,
    isAllowlisted: (match, line, file) => false,
    note: 'Webhook URLs allow unauthenticated incoming messages. Store in environment variables.'
  },
  {
    id: 'raw_jwt',
    name: 'Hardcoded JSON Web Token (JWT)',
    regex: /eyJ[A-Za-z0-9-_]{15,}\.eyJ[A-Za-z0-9-_]{15,}\.[A-Za-z0-9-_]{15,}/g,
    isAllowlisted: (match, line, file) => {
      const lower = line.toLowerCase();
      return (
        lower.includes('mock') ||
        lower.includes('example') ||
        lower.includes('test') ||
        lower.includes('dummy')
      );
    },
    note: 'Hardcoded JWTs risk authentication bypass or session hijacking.'
  }
];

// File types to skip (binaries, lockfiles, images)
const IGNORED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.woff', '.woff2', '.ttf'];
const IGNORED_FILES = ['package-lock.json'];

/**
 * Safely redact secret matches so logs and outputs never reveal the credential.
 */
function redact(str) {
  if (!str) return '[REDACTED]';
  const clean = str.replace(/[\r\n\t]/g, ' ').trim();
  if (clean.length <= 8) return '[REDACTED]';
  return clean.slice(0, 4) + '...' + clean.slice(-4) + ' [REDACTED]';
}

/**
 * Check if a filename violates forbidden credential file rules.
 */
function checkForbiddenFile(filename) {
  if (!filename) return null;
  const normalized = filename.replace(/\\/g, '/');
  for (const rule of FORBIDDEN_FILE_RULES) {
    if (rule.matches(normalized)) {
      return rule.name;
    }
  }
  return null;
}

/**
 * Audit lines from git diff.
 */
function auditDiff(diffText) {
  const findings = [];
  if (!diffText || !diffText.trim()) return findings;

  const lines = diffText.split('\n');
  let currentFile = null;
  let currentLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect target file from diff header
    if (line.startsWith('diff --git ')) {
      const parts = line.split(' ');
      currentFile = parts[3] ? parts[3].replace(/^b\//, '') : null;
      currentLineNum = 0;

      // Check forbidden file rule on file detection
      if (currentFile) {
        const forbiddenReason = checkForbiddenFile(currentFile);
        if (forbiddenReason) {
          findings.push({
            file: currentFile,
            line: 1,
            patternName: `Forbidden Tracked File: ${forbiddenReason}`,
            redactedMatch: currentFile,
            snippet: `File path matches sensitive credential exclusion: ${currentFile}`,
            note: 'Remove this file from Git staging and add it to .gitignore.'
          });
        }
      }
      continue;
    } else if (line.startsWith('+++ b/')) {
      currentFile = line.replace('+++ b/', '').trim();
      currentLineNum = 0;
      continue;
    }

    if (!currentFile) continue;

    // Skip ignored extensions and files
    const ext = path.extname(currentFile).toLowerCase();
    if (IGNORED_EXTENSIONS.includes(ext) || IGNORED_FILES.includes(path.basename(currentFile))) {
      continue;
    }

    // Skip the script itself if being edited, to prevent pattern matching its own definitions
    if (currentFile.replace(/\\/g, '/').endsWith('scripts/diff_audit.cjs')) {
      continue;
    }

    // Parse chunk header for line numbers: @@ -l,s +l,s @@
    if (line.startsWith('@@ ')) {
      const match = line.match(/\+([0-9]+)/);
      if (match) {
        currentLineNum = parseInt(match[1], 10) - 1;
      }
      continue;
    }

    // Only inspect added lines
    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentLineNum++;
      const addedContent = line.slice(1); // strip leading '+'

      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(addedContent)) !== null) {
          const secretMatch = match[0];
          if (!pattern.isAllowlisted(secretMatch, addedContent, currentFile)) {
            findings.push({
              file: currentFile,
              line: currentLineNum,
              patternName: pattern.name,
              redactedMatch: redact(secretMatch),
              snippet: redact(addedContent.trim()),
              note: pattern.note
            });
          }
        }
      }
    } else if (!line.startsWith('-')) {
      currentLineNum++;
    }
  }

  return findings;
}

/**
 * Audit all tracked repository files directly (for CI or full repository check).
 */
function auditAllFiles() {
  const findings = [];
  let trackedFiles = [];

  try {
    trackedFiles = execSync('git ls-files', { encoding: 'utf8' })
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.error('Failed to get tracked files:', err.message);
    process.exit(1);
  }

  for (const file of trackedFiles) {
    // Check forbidden file rules
    const forbiddenReason = checkForbiddenFile(file);
    if (forbiddenReason) {
      findings.push({
        file,
        line: 1,
        patternName: `Forbidden Tracked File: ${forbiddenReason}`,
        redactedMatch: file,
        snippet: `File path matches sensitive credential exclusion: ${file}`,
        note: 'Untrack file with git rm --cached and add to .gitignore.'
      });
      continue;
    }

    if (!fs.existsSync(file)) continue;

    const ext = path.extname(file).toLowerCase();
    if (IGNORED_EXTENSIONS.includes(ext) || IGNORED_FILES.includes(path.basename(file))) {
      continue;
    }

    // Skip the script itself
    if (file.replace(/\\/g, '/').endsWith('scripts/diff_audit.cjs')) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(line)) !== null) {
          const secretMatch = match[0];
          if (!pattern.isAllowlisted(secretMatch, line, file)) {
            findings.push({
              file,
              line: idx + 1,
              patternName: pattern.name,
              redactedMatch: redact(secretMatch),
              snippet: redact(line.trim()),
              note: pattern.note
            });
          }
        }
      }
    }
  }

  return findings;
}

/**
 * Self-test suite: runs synthetic test vectors through auditDiff() to verify scanner accuracy.
 */
function runSelfTests() {
  console.log('🧪 Running scanner self-test suite with synthetic test vectors...\n');

  // Vector 1: Synthetic dummy Google API key
  const dummyApiKeyDiff = `
diff --git a/src/config.js b/src/config.js
--- a/src/config.js
+++ b/src/config.js
@@ -10,1 +10,2 @@
+const apiKey = "AIzaSyB1234567890abcdefghijklmnopqrstuv";
`;

  // Vector 2: Synthetic dummy RSA private key
  const dummyRsaKeyDiff = `
diff --git a/server/key.js b/server/key.js
--- a/server/key.js
+++ b/server/key.js
@@ -1,1 +1,3 @@
+const key = \`-----BEGIN RSA PRIVATE KEY-----
+MIIEowIBAAKCAQEA0\`;
`;

  // Vector 3: Synthetic dummy Google OAuth secret
  const dummyOauthSecretDiff = `
diff --git a/server/oauth.js b/server/oauth.js
--- a/server/oauth.js
+++ b/server/oauth.js
@@ -5,1 +5,2 @@
+const clientSecret = "GOCSPX-abc123def456ghi789jkl012";
`;

  // Vector 4: Synthetic dummy 256-bit encryption key
  const dummyEncKeyDiff = `
diff --git a/server/config.js b/server/config.js
--- a/server/config.js
+++ b/server/config.js
@@ -2,1 +2,2 @@
+TOKEN_ENCRYPTION_KEY="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
`;

  // Vector 5: Allowlisted placeholder (should NOT trigger)
  const cleanPlaceholderDiff = `
diff --git a/src/test.js b/src/test.js
--- a/src/test.js
+++ b/src/test.js
@@ -1,1 +1,2 @@
+const dummyKey = "AIzaSy_dummy_placeholder_for_tests_123456";
`;

  // Vector 6: Forbidden file staged
  const forbiddenFileDiff = `
diff --git a/serviceAccountKey.json b/serviceAccountKey.json
new file mode 100644
--- /dev/null
+++ b/serviceAccountKey.json
@@ -0,0 +1,2 @@
+{"type": "service_account"}
`;

  const tests = [
    { name: 'Synthetic Google API Key', diff: dummyApiKeyDiff, expectFindings: 1 },
    { name: 'Synthetic RSA Private Key', diff: dummyRsaKeyDiff, expectFindings: 1 },
    { name: 'Synthetic Google OAuth Client Secret', diff: dummyOauthSecretDiff, expectFindings: 1 },
    { name: 'Synthetic 256-bit Encryption Key', diff: dummyEncKeyDiff, expectFindings: 1 },
    { name: 'Allowlisted Placeholder Key (clean)', diff: cleanPlaceholderDiff, expectFindings: 0 },
    { name: 'Forbidden File Detection (serviceAccountKey.json)', diff: forbiddenFileDiff, expectFindings: 1 }
  ];

  let passedCount = 0;
  for (const test of tests) {
    const findings = auditDiff(test.diff);
    if (findings.length === test.expectFindings) {
      console.log(`  ✅ PASS: ${test.name} (detected: ${findings.length}, expected: ${test.expectFindings})`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${test.name} (detected: ${findings.length}, expected: ${test.expectFindings})`);
    }
  }

  console.log(`\nSelf-test results: ${passedCount}/${tests.length} tests passed.`);
  if (passedCount === tests.length) {
    console.log('✅ All synthetic test vectors passed successfully.\n');
    process.exit(0);
  } else {
    console.error('❌ Some self-tests failed.\n');
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// MAIN ENTRYPOINT
// -----------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const scanAll = args.includes('--all');
  const scanCheck = args.includes('--check');
  const isTest = args.includes('--test');

  if (isTest) {
    return runSelfTests();
  }

  console.log('🔒 Sangam Secret Scanner');
  console.log('--------------------------------------------------');

  let findings = [];

  if (scanAll) {
    console.log('Mode: Scanning all tracked repository files (--all)...');
    findings = auditAllFiles();
  } else if (scanCheck) {
    console.log('Mode: Scanning both staged and working tree modifications (--check)...');
    try {
      const stagedDiff = execSync('git diff --cached --no-color', { encoding: 'utf8' });
      const unstagedDiff = execSync('git diff --no-color', { encoding: 'utf8' });
      findings = [...auditDiff(stagedDiff), ...auditDiff(unstagedDiff)];
    } catch (err) {
      console.error('Error executing git diff:', err.message);
      process.exit(1);
    }
  } else {
    // Default: scan staged changes (ideal for pre-commit)
    console.log('Mode: Scanning staged git changes (--staged)...');
    try {
      const stagedDiff = execSync('git diff --cached --no-color', { encoding: 'utf8' });
      if (!stagedDiff.trim()) {
        console.log('ℹ️  No staged changes found to audit.');
        console.log('✅ PASS: Working tree / staged diff is clean.');
        process.exit(0);
      }
      findings = auditDiff(stagedDiff);
    } catch (err) {
      console.error('Error executing git diff --cached:', err.message);
      process.exit(1);
    }
  }

  console.log('--------------------------------------------------');

  if (findings.length > 0) {
    console.error(`\n❌ SECURITY ALERT: Found ${findings.length} potential secret(s) in changes!\n`);
    findings.forEach((f, idx) => {
      console.error(`[${idx + 1}] ${f.file}:${f.line}`);
      console.error(`    Detected: ${f.patternName}`);
      console.error(`    Match:    ${f.redactedMatch}`);
      console.error(`    Context:  ${f.snippet.slice(0, 100)}`);
      if (f.note) {
        console.error(`    Advice:   ${f.note}`);
      }
      console.error('');
    });

    console.error('⛔ Commit / push halted: Please remove secrets, move them to .env, or use safe placeholders.');
    console.error('Refer to docs/SECRET_PREVENTION.md for remediation steps.\n');
    process.exit(1);
  } else {
    console.log('✅ AUDIT PASSED: Zero secrets detected in scanned changes.');
    process.exit(0);
  }
}

main();
