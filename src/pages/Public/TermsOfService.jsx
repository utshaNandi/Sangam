import React, { useEffect } from 'react';

/**
 * Public Terms of Service page for Sangam Academic Portal
 * URL: https://esangam.vercel.app/terms
 * Accessible publicly without authentication to satisfy Google OAuth verification requirements.
 */
export default function TermsOfService({ onNavigateHome, onNavigatePrivacy }) {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'Terms of Service — Sangam Academic Portal';
  }, []);

  const handleHomeClick = (e) => {
    e.preventDefault();
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/';
    }
  };

  const handlePrivacyClick = (e) => {
    e.preventDefault();
    if (onNavigatePrivacy) {
      onNavigatePrivacy();
    } else {
      window.location.href = '/privacy';
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
              href="/privacy"
              onClick={handlePrivacyClick}
              className="px-3.5 py-1.5 rounded-xl border border-[#D8D1C3] bg-[#F8F3E6] hover:bg-white text-xs font-bold text-[#3E2723] transition-all hover:border-[#171717]/30 shadow-2xs"
            >
              Privacy Policy
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#538C8C]/20 border border-[#538C8C]/40 text-xs font-bold text-[#204E4E] mb-4">
            <span className="w-2 h-2 rounded-full bg-[#204E4E]" />
            Official Agreement • Public
          </div>
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-[#3E2723] tracking-tight leading-tight">
            Terms of Service
          </h1>
          <p className="mt-4 text-sm md:text-base text-[#5D4037] leading-relaxed max-w-2xl">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Sangam Academic Portal (&ldquo;Sangam&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) hosted at{' '}
            <a href="https://esangam.vercel.app" className="underline font-semibold text-[#171717] hover:text-[#538C8C]">
              https://esangam.vercel.app
            </a>. Please read these Terms carefully before using the service.
          </p>

          <div className="mt-6 pt-6 border-t border-[#D8D1C3]/60 flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-[#858174]">
            <div><strong>Effective Date:</strong> October 18, 2026</div>
            <div><strong>Last Updated:</strong> October 18, 2026</div>
            <div><strong>Application:</strong> Sangam Academic Portal (v1.0)</div>
          </div>
        </div>

        {/* Legal Text Sections */}
        <div className="bg-[#F8F3E6] border border-[#D8D1C3] rounded-3xl p-8 md:p-12 shadow-sm space-y-10 text-sm leading-relaxed text-[#3E2723]/90">

          {/* Section 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">1</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Acceptance of Terms</h2>
            </div>
            <p>
              By accessing, browsing, or creating an account on the Sangam Academic Portal, you signify that you have read, understood, and agreed to be bound by these Terms of Service and our{' '}
              <a href="/privacy" onClick={handlePrivacyClick} className="underline font-bold text-[#538C8C] hover:text-[#3E2723]">
                Privacy Policy
              </a>. If you do not agree with any part of these Terms, you may not access or use the platform.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">2</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Description of Service & Eligibility</h2>
            </div>
            <p>
              Sangam is an educational management portal engineered for academic institutions. The platform facilitates:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#5D4037]">
              <li>Class allocation and academic space organization across departments, years, and sections.</li>
              <li>Creation and dissemination of academic assignments and syllabus guidelines by faculty members.</li>
              <li>Secure submission of coursework files (PDF format) by enrolled students.</li>
              <li>Faculty cloud storage integration connecting to personal Google Drive accounts for automated coursework organization.</li>
              <li>Institutional oversight and administrative account verification by academic Directors.</li>
            </ul>
            <p className="text-xs text-[#5D4037]">
              Use of Sangam is intended solely for verified students, faculty members, and academic administrators associated with the participating educational institution.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 3 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">3</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">User Accounts, Roles & Administrative Approval</h2>
            </div>
            <p>
              Sangam uses role-based authentication powered by Firebase Authentication:
            </p>
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]/80">
                <h4 className="font-bold text-[#171717] mb-1">Student Role:</h4>
                <p className="text-[#5D4037]">
                  Students register with their academic email and allocation details. Student accounts are subject to mandatory Director approval. Unapproved or inactive student accounts cannot access the dashboard or submit coursework until approved.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]/80">
                <h4 className="font-bold text-[#171717] mb-1">Faculty Role:</h4>
                <p className="text-[#5D4037]">
                  Faculty members create assignments, review submitted coursework, and optionally connect their Google Drive for automated assignment and submission routing. Faculty accounts require institutional verification.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 border border-[#D8D1C3]/80">
                <h4 className="font-bold text-[#171717] mb-1">Director Role:</h4>
                <p className="text-[#5D4037]">
                  Directors manage academic spaces, approve or decline pending student and staff registrations, allocate teaching assignments, and broadcast institutional announcements.
                </p>
              </div>
            </div>
            <p className="text-xs text-[#5D4037]">
              Users are responsible for safeguarding their login credentials and must immediately report any unauthorized access to their account or suspicious activity to the institutional administration.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 4 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">4</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Google Drive Integration & Academic File Routing</h2>
            </div>
            <p>
              Sangam includes an optional Google Drive integration designed for faculty convenience:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-[#5D4037]">
              <li>
                <strong>Scope Limitation:</strong> Sangam requests only the restricted <code className="font-mono bg-black/5 px-1 rounded">https://www.googleapis.com/auth/drive.file</code> scope, alongside basic profile and email scopes. Sangam only accesses folders and files it creates. It has zero capability or permission to access personal files or preexisting documents outside the Sangam coursework tree.
              </li>
              <li>
                <strong>Root Folder Creation:</strong> When authorized, Sangam creates a private directory named <strong>&ldquo;Sangam Coursework&rdquo;</strong> in the faculty member&rsquo;s Google Drive.
              </li>
              <li>
                <strong>Assignment & Submission Routing:</strong> Assignment prompt PDFs created by faculty and PDF submissions uploaded by students are saved into the faculty member&rsquo;s Google Drive folder.
              </li>
              <li>
                <strong>Faculty Ownership:</strong> All coursework documents stored in the connected Google Drive remain the property and under the direct control of the respective faculty member and institution.
              </li>
              <li>
                <strong>Disconnection:</strong> Faculty may disconnect their Google Drive at any time via Settings. Disconnecting revokes OAuth tokens and halts file routing without deleting existing files in Google Drive.
              </li>
            </ul>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 5 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">5</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Acceptable Use & Academic Integrity</h2>
            </div>
            <p>
              Users agree to use Sangam strictly for legitimate academic activities. You agree that you will NOT:
            </p>
            <div className="p-5 rounded-2xl bg-white/70 border border-[#D8D1C3] text-xs space-y-2 text-[#5D4037]">
              <div className="flex items-start gap-2">
                <span className="text-[#D67756] font-bold">✕</span>
                <p>Upload files containing malware, viruses, harmful scripts, or corrupted data.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#D67756] font-bold">✕</span>
                <p>Impersonate any other student, faculty member, administrator, or institutional authority.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#D67756] font-bold">✕</span>
                <p>Submit coursework on behalf of other individuals without authorization, or engage in academic dishonesty or plagiarism.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#D67756] font-bold">✕</span>
                <p>Attempt to probe, scan, or compromise platform security, reverse engineer backend endpoints, or circumvent token encryption.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#D67756] font-bold">✕</span>
                <p>Upload defamatory, harassing, unlawful, or copyright-infringing content.</p>
              </div>
            </div>
            <p className="text-xs text-[#5D4037]">
              Violation of these acceptable use terms may result in immediate suspension or termination of platform access and referral to institutional disciplinary committees.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 6 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">6</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Intellectual Property & Coursework Ownership</h2>
            </div>
            <p>
              All trademarks, service marks, logos, user interface designs, and software code constituting the Sangam platform remain the exclusive property of Sangam and its licensors.
            </p>
            <p className="text-xs text-[#5D4037]">
              Coursework materials, syllabi, assignment prompts, and student submission documents remain the intellectual property of their respective creators and/or the educational institution, governed by institutional intellectual property policies.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 7 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">7</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Disclaimer of Warranties</h2>
            </div>
            <p className="text-xs text-[#5D4037] leading-relaxed uppercase font-semibold">
              The Sangam Academic Portal is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis, without warranty of any kind, whether express, implied, statutory, or otherwise. To the maximum extent permitted by applicable law, we expressly disclaim all warranties of merchantability, fitness for a particular purpose, non-infringement, or that the service will be uninterrupted, error-free, secure, or free from data loss.
            </p>
            <p className="text-xs text-[#5D4037]">
              Users and educational institutions are responsible for maintaining independent backup copies of vital coursework, grades, and academic records.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 8 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">8</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Limitation of Liability</h2>
            </div>
            <p className="text-xs text-[#5D4037] leading-relaxed">
              To the fullest extent permitted by applicable law, Sangam, its developers, operators, and affiliated institutions shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation damages for loss of academic credits, loss of data, loss of goodwill, system downtime, or third-party service interruptions (including Google Drive or Firebase outages), arising out of or in connection with your use of or inability to use the platform.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 9 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">9</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Changes to Terms</h2>
            </div>
            <p>
              We reserve the right to amend or update these Terms of Service at any time. When updates are published, the &ldquo;Last Updated&rdquo; date at the top of this document will be revised. Continued use of the Sangam platform following any modifications constitutes your acknowledgment and acceptance of the revised Terms.
            </p>
          </section>

          <hr className="border-[#D8D1C3]/60" />

          {/* Section 10 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#3E2723]/10 text-[#3E2723] flex items-center justify-center text-xs font-bold">10</span>
              <h2 className="text-xl font-serif font-bold text-[#3E2723]">Contact & Governing Information</h2>
            </div>
            <p>
              For inquiries regarding these Terms of Service, academic policies, or platform administration, please contact:
            </p>
            <div className="p-5 rounded-2xl bg-white border border-[#D8D1C3] text-xs space-y-1.5">
              <p><strong>Project:</strong> Sangam Academic Portal</p>
              <p><strong>Production Domain:</strong> <a href="https://esangam.vercel.app" className="underline text-[#538C8C]">https://esangam.vercel.app</a></p>
              <p><strong>Email:</strong> <a href="mailto:sangam.academic@gmail.com" className="underline text-[#538C8C]">sangam.academic@gmail.com</a></p>
              <p><strong>Administrative Contact:</strong> Academic Director / Institutional Administration</p>
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
            <a href="/privacy" onClick={handlePrivacyClick} className="hover:text-[#3E2723] underline transition-colors">
              Privacy Policy
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
