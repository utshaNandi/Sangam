# Sangam Repository — Secret Prevention & Security Guide

This document details the automated secret prevention system implemented in the Sangam codebase. It explains how secrets and credentials are kept out of Git, how to run scanners locally, how pre-commit hooks are configured, how CI checks work, and how to respond if a secret is ever exposed.

---

## 1. Multi-Layered Defense Architecture

Sangam uses a three-layer defense-in-depth model to prevent accidental leaks of sensitive credentials, API keys, and environment files:

| Layer | Mechanism | Scope | Action on Detection |
| :--- | :--- | :--- | :--- |
| **Layer 1: Exclusion** | `.gitignore` | Working directory & file system | Automatically prevents tracking `.env`, private keys, and service account JSON files. |
| **Layer 2: Local Pre-Commit** | Native Git Hook (`.githooks/pre-commit` calling `scripts/diff_audit.cjs`) | Staged git diff before commit | Aborts `git commit` immediately with exit code 1; redacts detected tokens. |
| **Layer 3: Remote CI** | GitHub Actions (`.github/workflows/secret-scan.yml`) + Gitleaks | Pushes & Pull Requests | Blocks PR merges and triggers workflow failure if credentials are introduced. |

---

## 2. Protected Credential Types & Patterns

The repository scanner (`scripts/diff_audit.cjs`) actively monitors staged and repository files for:

1. **Google Web & Cloud API Keys (`AIza...`)**: High-entropy 39-character keys.
2. **Private Key Headers**: RSA, EC, DSA, and OpenSSH private key blocks (`-----BEGIN ... PRIVATE KEY-----`).
3. **Google OAuth 2.0 Client Secrets**: Prefixed with `GOCSPX-`.
4. **Firebase / GCP Service Account Private Keys**: \`private_key\` property containing a PEM private key block.
5. **High-Entropy 256-bit Hex Keys**: `TOKEN_ENCRYPTION_KEY`, `ENCRYPTION_KEY`, or `SECRET_KEY` assigned 64 hex characters.
6. **Payment Provider API Keys**: Stripe test and live secret keys (`sk_live_...`, `sk_test_...`).
7. **GitHub Personal Access Tokens**: Prefixed with `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`.
8. **Communication Webhooks**: Slack and Discord webhook endpoints.
9. **Raw JSON Web Tokens (JWTs)**: Hardcoded `eyJ...` tokens.
10. **Forbidden File Staging**: Direct staging of `.env*` (except `.env.example`), `*serviceAccountKey*.json`, `*firebase-adminsdk*.json`, `client_secret*.json`, `credentials.json`, `*.pem`, and `*.key`.

---

## 3. Local Scanning Usage

Developers can run the scanner locally at any time using the bundled Node.js CLI:

```bash
# 1. Audit staged git changes (same check executed before commit)
node scripts/diff_audit.cjs

# 2. Audit all tracked files in the entire repository
npm run audit:secrets
# or: node scripts/diff_audit.cjs --all

# 3. Audit both staged changes and unstaged working-tree modifications
node scripts/diff_audit.cjs --check

# 4. Run the scanner self-test suite (validates detection accuracy using synthetic vectors)
npm run audit:secrets:test
# or: node scripts/diff_audit.cjs --test
```

### Output Redaction
All findings output to the console redact sensitive tokens (e.g. `AIza...[REDACTED]`), preventing accidental leaks in terminal logs or IDE output streams.

---

## 4. Git Pre-Commit Hook Setup

To ensure all team members and new contributors receive identical pre-commit protection without installing complex third-party tools, Sangam uses Git's native `core.hooksPath` feature:

### Automatic Installation on `npm install`
The `package.json` includes an npm `prepare` script:
```json
"scripts": {
  "prepare": "git config core.hooksPath .githooks || exit 0"
}
```
When you clone the repository and run `npm install`, Git's hooks path is automatically configured to point to `.githooks/`.

### Manual Installation / Verification
If you need to configure the hook manually, run:
```bash
git config core.hooksPath .githooks
```

To verify the hook is active:
```bash
git config --get core.hooksPath
# Expected output: .githooks
```

---

## 5. Continuous Integration (CI) Checks

The GitHub Actions workflow at `.github/workflows/secret-scan.yml` runs on every `push` and `pull_request` to `main`, `master`, and development branches:

1. **Repository Check**: Clones full git history using `actions/checkout@v4` (`fetch-depth: 0`).
2. **In-Repo Audit**: Executes `npm run audit:secrets` and `npm run audit:secrets:test`.
3. **Gitleaks Scan**: Runs pinned `gitleaks/gitleaks-action@v2.3.8` with `GITLEAKS_VERBOSE: 'false'`.
4. **Failure Behavior**: If any secret or sensitive key is found, the workflow exits with a failure status and blocks the pull request from merging.

Configuration for Gitleaks is stored in `.gitleaks.toml`.

---

## 6. Public vs. Private Credentials: Context & False Positives

Not every credential is an exploitable secret, but each must be handled with appropriate controls:

### Firebase Client-Side Web API Key (`AIza...`)
- **Nature**: Google Firebase client API keys (`VITE_FIREBASE_API_KEY`) identify your Firebase project to Google APIs from the user's web browser. They are not secret by design.
- **Security Mechanism**: Client-side keys are protected by:
  1. Firestore and Storage Security Rules (`firestore.rules`).
  2. Google Cloud API Key Restrictions (e.g. HTTP Referrer restrictions allowing only `https://yourdomain.edu`).
  3. Firebase App Check.
- **Handling in Scanner**: Placeholders (`dummy`, `example`, `placeholder`, `YOUR_...`) and documentation examples are allowlisted. Real-looking keys in backend files or `.env` are flagged with contextual guidance.

### Server-Side Secrets (Must NEVER be committed)
- Google OAuth 2.0 Client Secret (`GOOGLE_CLIENT_SECRET`)
- Firebase Admin SDK Service Account credentials (`GOOGLE_APPLICATION_CREDENTIALS`, private keys)
- Drive OAuth Token Encryption Key (`TOKEN_ENCRYPTION_KEY`)
- Private RSA/EC keys and certificates

These must only reside in untracked local `.env` files or secure runtime secret managers.

---

## 7. Incident Response: What To Do If A Secret Is Exposed

If a credential or secret is committed or pushed to a remote repository, follow this incident response protocol immediately:

> [!IMPORTANT]
> **Rule 1: Never rely solely on Git history rewriting or deleting the commit.**
> Once a commit is pushed to a remote or public repository, consider the credential compromised. Automated scrapers can clone commits within seconds.

### Step-by-Step Incident Response Protocol

1. **Revoke the Credential Immediately at the Source**:
   - **Google Cloud / OAuth**: Go to Google Cloud Console > *APIs & Services* > *Credentials*, find the client secret or API key, and revoke or delete it.
   - **Firebase Service Account**: Go to Firebase Project Settings > *Service accounts* > generate a new key and delete the old key pair.
   - **Token Encryption Key (`TOKEN_ENCRYPTION_KEY`)**: Generate a new 32-byte hex key using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. *Note: Existing encrypted Drive tokens in Firestore must be re-encrypted or re-authenticated.*
   - **GitHub PAT / Third-Party Token**: Immediately revoke the token from the provider settings.

2. **Generate and Deploy New Credentials**:
   - Update your local `.env` file with the newly generated secret.
   - Update production environment variables on your hosting provider (e.g. Render, Railway, Vercel, GCP).

3. **Verify Git Repository Cleanliness**:
   - Stage the removal of the credential from source files.
   - If uncommitted: run `git reset HEAD <file>` and move the secret to `.env`.
   - Run `node scripts/diff_audit.cjs` to confirm the fix passes.

4. **Audit Provider Access Logs**:
   - Review Google Cloud Audit Logs and Firebase Authentication logs for unauthorized activity during the window between commit and revocation.

5. **Coordinate with Team & Repository Admin**:
   - Notify the repository maintainers before taking any destructive Git actions (such as `git filter-repo` or BFG). Never force-push or rewrite shared branch histories without explicit owner coordination.
