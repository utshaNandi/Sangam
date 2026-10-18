import React, { useEffect } from 'react';

/**
 * Public Privacy Policy page for Sangam Academic Portal
 * URL: https://esangam.vercel.app/privacy
 * Accessible publicly without authentication to satisfy Google OAuth verification requirements.
 */
export default function PrivacyPolicy({ onNavigateHome, onNavigateTerms }) {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'Privacy Policy — Sangam Academic Portal';
  }, []);

  const handleHomeClick = (e) => {
    e.preventDefault();
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/';
    }
  };

  const handleTermsClick = (e) => {
    e.preventDefault();
    if (onNavigateTerms) {
      onNavigateTerms();
    } else {
      window.location.href = '/terms';
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F4EEE2] text-[#171717] font-sans antialiased selection:bg-[#F5E5EE] selection:text-[#171717] z-[500]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#F8F3E6]/90 backdrop-blur-md border-b border-[#D8D1C3] shadow-xs">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Sangam Interlocking Rings Brand Mark */}
            <a href="/" onClick={handleHomeClick} className="flex items-center gap-3 group" title="Return to Sangam Home">
              <div className="relative w-8 h-5 flex justify-center items-center">
                <div className="absolute left-0 w-4 h-4 rounded-full border-[1.5px] border-[#3E2723]/60 mix-blend-multiply group-hover:scale-105 transition-transform" />
                <div className="absolute right-0 w-4 h-4 rounded-full border-[1.5px] border-[#3E2723]/60 bg-[#DFB980]/50 mix-blend-multiply group-hover:scale-105 transition-transform" />
              </div>
              <span className="font-serif font-bold text-xl text-[#3E2723] tracking-tight">Sangam</span>
            </a>
            <span className="hidden sm:inline-block text-[#858174] text-xs font-medium border-l border-[#D8D1C3] pl-3 py-0.5">
              Academic Portal
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/terms"
              onClick={handleTermsClick}
              className="px-3.5 py-1.5 rounded-xl border border-[#D8D1C3] bg-[#F8F3E6] hover:bg-white text-xs font-bold text-[#3E2723] transition-all hover:border-[#171717]/30 shadow-2xs"
            >
              Terms of Service
            </a>
            <a
              href="/"
              onClick={handleHomeClick}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#171717] hover:bg-[#333] text-[#F8F3E6] text-xs font-bold transition-all shadow-xs hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>←</span>
              <span>Back to Sangam</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-16">
        {/* Document Header Card */}
        <div className="bg-[#F8F3E6] border border-[#D8D1C3] rounded-3xl p-8 md:p-10 shadow-sm mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DFB980]/25 border border-[#DFB980]/50 text-xs font-bold text-[#735A00] mb-4">
            <span className="w-2 h-2 rounded-full bg-[#735A00]" />
            Official Legal Policy • Public
          </div>
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-[#3E2723] tracking-tight leading-tight">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm md:text-base text-[#5D4037] leading-relaxed max-w-2xl">
            This Privacy Policy explains how Sangam Academic Portal (&ldquo;Sangam&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, protects, and handles personal data, academic coursework, and Google User Data across our web platform located at{' '}
            <a href="https://esangam.vercel.app" className="underline font-semibold text-[#171717] hover:text-[#538C8C]">
              https://esangam.vercel.app
            </a>.
          </p>

          <div className="mt-6 pt-6 border-t border-[#D8D1C3]/60 flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-[#858174]">
            <div><strong>Effective Date:</strong> October 18, 2026</div>
            <div><strong>Last Updated:</strong> October 18, 2026</div>
            <div><strong>Application:</strong> Sangam Academic Portal (v1.0)</div>
          </div>
        </div>

        {/* Quick Highlights / Trust Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <div className="p-5 rounded-2xl bg-[#F8F3E6] border border-[#D8D1C3] shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-[#538C8C]/20 text-[#538C8C] flex items-center justify-center font-bold text-sm mb-3">
              📁
            </div>
            <h3 className="font-bold text-sm text-[#171717] mb-1">Restricted Drive Scope</h3>
            <p className="text-xs text-[#858174] leading-relaxed">
              We only request <code className="text-[11px] font-mono bg-black/5 px-1 py-0.5 rounded">drive.file</code>. Sangam cannot see, read, or modify existing files outside of coursework files created by Sangam.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#F8F3E6] border border-[#D8D1C3] shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-[#D67756]/20 text-[#D67756] flex items-center justify-center font-bold text-sm mb-3">
              🔒
            </div>
            <h3 className="font-bold text-sm text-[#171717] mb-1">AES-256-GCM Encryption</h3>
            <p className="text-xs text-[#858174] leading-relaxed">
              Google OAuth tokens are encrypted at rest using AES-256-GCM authenticated encryption before saving to Firestore.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#F8F3E6] border border-[#D8D1C3] shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-[#A9BD78]/30 text-[#24461B] flex items-center justify-center font-bold text-sm mb-3">
              🛡️
            </div>
            <h3 className="font-bold text-sm text-[#171717] mb-1">No Sale or AI Training</h3>
            <p className="text-xs text-[#858174] leading-relaxed">
              We never sell user data, display commercial advertisements, or use student coursework or Google data to train AI models.
            </p>
          </div>
        </div>

        {/* Legal Text Sections */}
        <div className="bg-[#F8F3E6] border border-[#D8D1C3] rounded-3xl p-8 md:p-12 shadow-sm space-y-10 text-sm leading-relaxed text-[#3E2723]/90">

          {/* Section 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">1</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Overview & Academic Purpose</h2>
            </div>
            <p>
              Sangam is an academic course management platform developed for educational institutions to organize academic spaces, facilitate coursework assignments, receive student submission PDFs, and integrate cloud storage for faculty members.
            </p>
            <p>
              Sangam operates on an institution-coordinated model: users access the platform under specific roles (&ldquo;Student&rdquo;, &ldquo;Faculty&rdquo;, or &ldquo;Director&rdquo;). Access is strictly restricted to authorized institutional participants whose profiles are verified and approved by the academic Director.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 2 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">2</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Information We Collect & Process</h2>
            </div>
            <p>
              We collect only the minimum necessary information required to operate educational workflows. The data collected depends on your role and feature usage:
            </p>

            <div className="space-y-3 pl-2">
              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]/80">
                <h3 className="font-bold text-[#171717] mb-1">A. Authentication & Account Profiles</h3>
                <p className="text-xs text-[#5D4037] leading-relaxed">
                  User accounts are authenticated through Google Firebase Authentication. We collect your email address, full name, role (Student, Faculty, or Director), and academic allocations (department, year, section, and roll number). Passwords are securely hashed by Firebase Authentication; Sangam servers never receive or store plaintext passwords.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]/80">
                <h3 className="font-bold text-[#171717] mb-1">B. Academic Coursework & Assignment Materials</h3>
                <p className="text-xs text-[#5D4037] leading-relaxed">
                  When faculty create coursework, we store assignment metadata (title, instructions, due date, total marks, academic department, year, and section). If faculty attach an assignment document or syllabus PDF, the file is processed and stored in the allocated cloud storage.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]/80">
                <h3 className="font-bold text-[#171717] mb-1">C. Student Submissions</h3>
                <p className="text-xs text-[#5D4037] leading-relaxed">
                  When students submit coursework, Sangam receives the student&rsquo;s uploaded PDF file, records the submission timestamp, student identifier, and file metadata in Firestore, and securely routes the submission file to the designated faculty member&rsquo;s connected Google Drive storage.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]/80">
                <h3 className="font-bold text-[#171717] mb-1">D. Google OAuth Data (Faculty Storage Integration)</h3>
                <p className="text-xs text-[#5D4037] leading-relaxed">
                  When a faculty member explicitly connects their Google Drive account, Sangam requests permission via Google OAuth 2.0 to access Google services. The specific data retrieved and scopes requested are detailed in Section 3 below.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 3 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">3</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Google OAuth & Google Drive Integration</h2>
            </div>
            <p>
              Sangam provides an optional cloud storage integration allowing faculty to store course materials and student submissions directly in their own Google Drive account.
            </p>

            {/* Scope Table */}
            <div className="overflow-x-auto rounded-2xl border border-[#D8D1C3] bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#F4EEE2] border-b border-[#D8D1C3] text-[#3E2723]">
                    <th className="py-3 px-4 font-bold">Google OAuth Scope</th>
                    <th className="py-3 px-4 font-bold">Permission Description</th>
                    <th className="py-3 px-4 font-bold">How Sangam Uses It</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8D1C3]/60 text-[#5D4037]">
                  <tr>
                    <td className="py-3 px-4 font-mono text-[11px] font-bold text-[#171717]">
                      https://www.googleapis.com/auth/drive.file
                    </td>
                    <td className="py-3 px-4">
                      Per-file access: View and manage Google Drive files and folders that you have opened or created with this app.
                    </td>
                    <td className="py-3 px-4">
                      Creates and manages a dedicated root folder named <strong>&ldquo;Sangam Coursework&rdquo;</strong> in the faculty member&rsquo;s Google Drive, along with department and assignment subfolders, and stores assignment PDFs and student submissions inside.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono text-[11px] font-bold text-[#171717]">
                      https://www.googleapis.com/auth/userinfo.email
                    </td>
                    <td className="py-3 px-4">
                      View your primary Google Account email address.
                    </td>
                    <td className="py-3 px-4">
                      Verifies and displays the connected Google account email in the faculty member&rsquo;s Settings view to confirm account association.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono text-[11px] font-bold text-[#171717]">
                      https://www.googleapis.com/auth/userinfo.profile
                    </td>
                    <td className="py-3 px-4">
                      View your basic profile info.
                    </td>
                    <td className="py-3 px-4">
                      Retrieves display name to confirm identity during the Google account connection process.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Strict Limits Box */}
            <div className="p-5 rounded-2xl bg-[#B7C9EA]/20 border border-[#B7C9EA]/50 text-xs text-[#1B2B48] space-y-2">
              <div className="font-bold flex items-center gap-2 text-sm text-[#1b3a5b]">
                <span>🔒</span> Strict Limitation on Google Drive Access
              </div>
              <p>
                Sangam requests the restricted <code className="px-1.5 py-0.5 rounded bg-white font-mono font-bold text-[#1b3a5b]">drive.file</code> scope. This is a deliberate security decision:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Sangam <strong>CANNOT</strong> access, list, read, edit, or delete any files or folders that you created prior to connecting or that were created outside of Sangam.</li>
                <li>Sangam <strong>CANNOT</strong> access your personal Google Drive files, personal photos, private documents, spreadsheets, or folders.</li>
                <li>Sangam operates exclusively inside the dedicated <strong>&ldquo;Sangam Coursework&rdquo;</strong> directory tree created for academic purposes.</li>
              </ul>
            </div>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 4 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">4</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Google API Services User Data Policy Compliance</h2>
            </div>
            <p>
              Sangam&rsquo;s use and transfer to any other app of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-bold text-[#538C8C] hover:text-[#3E2723]"
              >
                Google API Services User Data Policy
              </a>, including the <strong>Limited Use</strong> requirements:
            </p>
            <div className="p-5 rounded-2xl bg-white border border-[#D8D1C3] space-y-2.5 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-[#A9BD78] font-bold text-sm">✓</span>
                <p><strong>Limited Use:</strong> Google user data is used exclusively to provide academic coursework storage capabilities requested directly by faculty members.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#A9BD78] font-bold text-sm">✓</span>
                <p><strong>No Human Reading:</strong> No human personnel at Sangam inspects, reads, or views your Google Drive files or tokens unless explicitly requested by you for technical troubleshooting or required by law.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#A9BD78] font-bold text-sm">✓</span>
                <p><strong>No Data Transfers:</strong> We do not transfer Google user data to third parties, advertising platforms, data brokers, or marketing entities.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#A9BD78] font-bold text-sm">✓</span>
                <p><strong>No Advertising:</strong> Sangam does not serve advertisements and does not use Google user data for retargeting, personalized advertising, or market research.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#A9BD78] font-bold text-sm">✓</span>
                <p><strong>No AI Model Training:</strong> Google user data and student submission files are not used to train machine learning or artificial intelligence models.</p>
              </div>
            </div>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 5 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">5</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Data Security & Cryptographic Protection</h2>
            </div>
            <p>
              We implement technical and operational safeguards designed to protect user data from unauthorized access, loss, or alteration. We only state security controls that are implemented directly in our code:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]">
                <h4 className="font-bold text-[#171717] mb-1">AES-256-GCM Token Encryption</h4>
                <p className="text-[#5D4037] leading-relaxed">
                  OAuth access tokens and refresh tokens are encrypted at rest using AES-256-GCM authenticated encryption with a unique 96-bit initialization vector (IV) and a 128-bit authentication tag for each token prior to persistence in Firestore (<code className="font-mono text-[11px]">faculty_storage_integrations</code> collection).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]">
                <h4 className="font-bold text-[#171717] mb-1">Key Isolation</h4>
                <p className="text-[#5D4037] leading-relaxed">
                  Encryption keys are stored exclusively in secure server-side environment variables and are never transmitted to client browsers, logged, or exposed in public code repositories.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]">
                <h4 className="font-bold text-[#171717] mb-1">Anti-CSRF State Protection</h4>
                <p className="text-[#5D4037] leading-relaxed">
                  OAuth authorization requests use cryptographically random 32-byte hexadecimal state tokens stored in Firestore with a 10-minute expiry, consumed atomically inside database transactions to prevent CSRF attacks.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]">
                <h4 className="font-bold text-[#171717] mb-1">Encrypted In-Transit</h4>
                <p className="text-[#5D4037] leading-relaxed">
                  All communication between clients, our backend API, Google Cloud APIs, and Firebase services is conducted over TLS/HTTPS (Transport Layer Security) encryption.
                </p>
              </div>
            </div>
            <p className="text-xs text-[#858174] italic">
              Note: We do not claim external compliance certifications (such as SOC 2, ISO 27001, or HIPAA) that are not formally applicable to the project.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 6 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">6</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">User Control, Disconnection & Data Retention</h2>
            </div>
            <p>
              Faculty members retain complete control over their connected Google Drive integration:
            </p>
            <div className="p-5 rounded-2xl bg-white/70 border border-[#D8D1C3] space-y-3 text-xs">
              <div>
                <h4 className="font-bold text-[#171717]">How to Disconnect Google Drive:</h4>
                <p className="text-[#5D4037] mt-1">
                  Faculty can disconnect at any time by navigating to <strong>Teacher Settings &gt; Google Drive &gt; Disconnect</strong>.
                </p>
              </div>
              <div>
                <h4 className="font-bold text-[#171717]">What Happens Upon Disconnection:</h4>
                <p className="text-[#5D4037] mt-1">
                  Sangam immediately calls Google&rsquo;s token revocation endpoint (<code className="font-mono text-[11px]">https://oauth2.googleapis.com/revoke</code>) to permanently invalidate the authorization, deletes or disables the stored token record in Firestore, and ceases all connection to your Google account.
                </p>
              </div>
              <div>
                <h4 className="font-bold text-[#171717]">Your Files Remain Safe:</h4>
                <p className="text-[#5D4037] mt-1">
                  Disconnecting does <strong>NOT</strong> delete or alter the &ldquo;Sangam Coursework&rdquo; folder or any files already saved to your Google Drive. All coursework files remain in your personal Google Drive under your complete ownership.
                </p>
              </div>
            </div>
            <p className="text-xs text-[#5D4037]">
              To request deletion of your Sangam platform profile, student submission records, or account credentials, please contact your institution&rsquo;s academic Director or email us at the contact address below.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 7 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">7</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Third-Party Service Providers</h2>
            </div>
            <p>
              Sangam uses trusted cloud infrastructure providers to deliver its services:
            </p>
            <ul className="list-disc pl-5 text-xs space-y-2 text-[#5D4037]">
              <li><strong>Google Firebase / Google Cloud Platform:</strong> Authentication, Firestore database storage, and security rules enforcement.</li>
              <li><strong>Google Drive API:</strong> Cloud storage routing for coursework materials and student PDF submissions.</li>
              <li><strong>Vercel Inc.:</strong> Web application hosting, static asset delivery, and serverless API execution.</li>
            </ul>
            <p className="text-xs text-[#5D4037]">
              These third-party providers process data solely as necessary to host, secure, and deliver the application services in accordance with their respective privacy and security commitments.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 8 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">8</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Contact Us</h2>
            </div>
            <p>
              If you have any questions, concerns, or inquiries regarding this Privacy Policy, our data practices, or your Google User Data, please contact us:
            </p>
            <div className="p-5 rounded-2xl bg-white border border-[#D8D1C3] text-xs space-y-1.5">
              <p><strong>Project:</strong> Sangam Academic Portal</p>
              <p><strong>Production Domain:</strong> <a href="https://esangam.vercel.app" className="underline text-[#538C8C]">https://esangam.vercel.app</a></p>
              <p><strong>Email:</strong> <a href="mailto:sangam.academic@gmail.com" className="underline text-[#538C8C]">sangam.academic@gmail.com</a></p>
              <p><strong>Administrative Contact:</strong> Institutional Director / Academic Administration Office</p>
            </div>
          </section>

        </div>

        {/* Footer Navigation */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#858174]">
          <div>
            © {new Date().getFullYear()} Sangam Academic Portal. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <a href="/" onClick={handleHomeClick} className="hover:text-[#3E2723] underline transition-colors">
              Home
            </a>
            <span>•</span>
            <a href="/terms" onClick={handleTermsClick} className="hover:text-[#3E2723] underline transition-colors">
              Terms of Service
            </a>
            <span>•</span>
            <a href="https://esangam.vercel.app" className="hover:text-[#3E2723] underline transition-colors">
              Production Portal
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
