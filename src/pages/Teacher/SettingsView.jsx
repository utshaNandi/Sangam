import { useState, useEffect, useCallback } from 'react';
import { getStorageStatus, getGoogleAuthUrl, disconnectStorage } from '../../services/storageService';

function GoogleDriveIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85L10.45 73.5C11.25 74.9 12.4 76 13.75 76.8L27.5 53H0C0 54.55 0.4 56.1 1.2 57.55L6.6 66.85Z" fill="#0066DA" />
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5C0.4 49.95 0 51.5 0 53H27.5L43.65 25Z" fill="#00AC47" />
      <path d="M73.55 76.8C74.9 76 76.05 74.9 76.85 73.5L86.1 57.55C86.9 56.1 87.3 54.55 87.3 53H59.8L73.55 76.8Z" fill="#EA4335" />
      <path d="M43.65 25L57.4 1.2C56.05 0.4 54.5 0 52.9 0H34.4C32.8 0 31.25 0.45 29.9 1.2L43.65 25Z" fill="#00832D" />
      <path d="M59.8 53H27.5L13.75 76.8C15.1 77.6 16.65 78 18.25 78H69.05C70.65 78 72.2 77.55 73.55 76.8L59.8 53Z" fill="#2684FC" />
      <path d="M73.4 26.5L60.7 4.5C59.9 3.1 58.75 2 57.4 1.2L43.65 25L59.8 53H87.3C87.3 51.45 86.9 49.9 86.1 48.5L73.4 26.5Z" fill="#FFBA00" />
    </svg>
  );
}

export default function SettingsView({ userProfile }) {
  const [storageState, setStorageState] = useState({
    isLoading: true,
    isConnected: false,
    provider: null,
    accountEmail: '',
    connectedAt: null,
    error: null
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  /**
   * Fetches verified storage connection status directly from the authenticated backend.
   */
  const loadStatus = useCallback(async () => {
    setStorageState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await getStorageStatus();
      setStorageState({
        isLoading: false,
        isConnected: Boolean(data?.connected),
        provider: data?.provider || null,
        accountEmail: data?.accountEmail || '',
        connectedAt: data?.connectedAt || null,
        error: null
      });
    } catch (err) {
      setStorageState({
        isLoading: false,
        isConnected: false,
        provider: null,
        accountEmail: '',
        connectedAt: null,
        error: err.message || 'Unable to connect to storage service.'
      });
    }
  }, []);

  /**
   * Handle OAuth return query parameters, then immediately sanitize URL.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    const statusParam = url.searchParams.get('storage_status');
    const errorParam = url.searchParams.get('error');

    if (statusParam) {
      if (statusParam === 'connected') {
        setNotification({
          type: 'success',
          message: 'Google Drive authorization succeeded. Verifying account connection...'
        });
      } else if (statusParam === 'error') {
        setNotification({
          type: 'error',
          message: errorParam
            ? `Google authorization was not completed: ${errorParam}`
            : 'Google authorization was cancelled or denied.'
        });
      }

      // Clean up URL query parameters without triggering navigation or losing other params
      url.searchParams.delete('storage_status');
      url.searchParams.delete('provider');
      url.searchParams.delete('error');
      const cleanSearch = url.searchParams.toString();
      const newUrl = url.pathname + (cleanSearch ? `?${cleanSearch}` : '') + url.hash;
      window.history.replaceState({}, document.title, newUrl);
    }

    loadStatus();
  }, [loadStatus]);

  /**
   * Initiates Google Drive OAuth flow.
   */
  const handleConnectGoogleDrive = async () => {
    setActionLoading(true);
    setNotification(null);
    try {
      const result = await getGoogleAuthUrl();
      if (result?.url) {
        // Redirect browser to Google's real consent screen
        window.location.href = result.url;
      } else {
        throw new Error('Backend did not return an authorization URL.');
      }
    } catch (err) {
      setActionLoading(false);
      setNotification({
        type: 'error',
        message: err.message || 'Failed to initiate Google Drive connection.'
      });
    }
  };

  /**
   * Disconnects Google Drive after explicit user confirmation.
   */
  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to disconnect Google Drive?\n\n' +
      'Sangam will revoke authorization with Google and remove stored credentials. ' +
      'Your existing files on Google Drive will remain untouched.'
    );

    if (!confirmed) return;

    setActionLoading(true);
    setNotification(null);

    try {
      const res = await disconnectStorage();
      setNotification({
        type: 'info',
        message: res.message || 'Google Drive integration disconnected.'
      });
      // Re-verify status with backend rather than assuming local state
      await loadStatus();
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to disconnect Google Drive.'
      });
      await loadStatus();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-hero-fade-up relative z-10 pb-12" style={{ animationDuration: '400ms' }}>
      {/* Page Header */}
      <div>
        <h2 className="text-3xl md:text-5xl font-extrabold text-[#171717] tracking-tight mb-2">Settings</h2>
        <p className="text-sm md:text-base font-bold text-[#858174]">
          Manage your account preferences, integrations, and coursework cloud storage.
        </p>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between gap-4 transition-all duration-300 ${
            notification.type === 'success'
              ? 'bg-[#A9BD78]/20 border-[#A9BD78]/60 text-[#24461B]'
              : notification.type === 'error'
              ? 'bg-[#EFA9D1]/30 border-[#EFA9D1]/80 text-[#5E193C]'
              : 'bg-[#F3D75E]/20 border-[#F3D75E]/60 text-[#4D3F00]'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {notification.type === 'success' ? '✓' : notification.type === 'error' ? '⚠' : 'ℹ'}
            </span>
            <p className="text-sm font-bold">{notification.message}</p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-sm font-bold opacity-60 hover:opacity-100 transition-opacity p-1 leading-none"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Connected Cloud Storage Section */}
      <div className="bg-white/80 rounded-[32px] border border-[#D8D1C3] p-6 md:p-10 shadow-xs relative overflow-hidden">
        {/* Subtle Decorative Background Blob */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#EFA9D1]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#D8D1C3]/60 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#171717] text-[#F8F3E6] text-xs font-bold mb-3 shadow-xs">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
                Cloud Integrations
              </div>
              <h3 className="text-2xl font-extrabold text-[#171717] tracking-tight">Connected Cloud Storage</h3>
              <p className="text-sm text-[#858174] font-medium mt-1">
                Link your cloud drive to enable direct, private storage for assignment master files and student submissions.
              </p>
            </div>

            <button
              onClick={loadStatus}
              disabled={storageState.isLoading || actionLoading}
              className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#D8D1C3] bg-[#FDFBF7] hover:bg-[#F5E5EE] text-xs font-bold text-[#171717] transition-all disabled:opacity-50 shadow-xs"
              title="Refresh connection status from server"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={storageState.isLoading ? 'animate-spin' : ''}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              Refresh Status
            </button>
          </div>

          {/* Storage Cards Container */}
          <div className="space-y-4">
            {/* Google Drive Integration Card */}
            <div className="rounded-2xl border border-[#D8D1C3] bg-[#FDFBF7] p-6 transition-all hover:border-[#171717]/30 shadow-xs">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                {/* Left: Icon & Provider Details */}
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-[#D8D1C3] flex items-center justify-center p-3 shadow-xs shrink-0">
                    <GoogleDriveIcon className="w-8 h-8" />
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-lg font-extrabold text-[#171717]">Google Drive</h4>

                      {/* State Badges */}
                      {storageState.isLoading ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#858174]/15 text-[#858174]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#858174] animate-pulse" />
                          Checking...
                        </span>
                      ) : storageState.isConnected ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#A9BD78]/25 text-[#24461B] border border-[#A9BD78]/40">
                          <span className="w-2 h-2 rounded-full bg-[#24461B]" />
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F3D75E]/25 text-[#735A00] border border-[#F3D75E]/40">
                          Not Connected
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#858174] font-medium max-w-xl leading-relaxed">
                      {storageState.isConnected
                        ? 'Your Google Drive is authorized. Student coursework files will be stored directly into your dedicated Sangam coursework folder.'
                        : 'Connect Google Drive to allow student coursework submissions to be routed directly to your personal cloud without public sharing.'}
                    </p>

                    {/* Connected Account Information */}
                    {storageState.isConnected && storageState.accountEmail && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-[#171717]">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-[#D8D1C3]">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          Account: {storageState.accountEmail}
                        </span>

                        {storageState.connectedAt && (
                          <span className="text-[#858174] font-medium">
                            Linked: {new Date(storageState.connectedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Error Banner inside Card */}
                    {storageState.error && (
                      <div className="mt-3 text-xs font-bold text-[#5E193C] bg-[#EFA9D1]/20 p-2.5 rounded-xl border border-[#EFA9D1]/50">
                        {storageState.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Action Buttons */}
                <div className="sm:self-center shrink-0 w-full sm:w-auto">
                  {storageState.isLoading ? (
                    <button
                      disabled
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white border border-[#D8D1C3] text-xs font-bold text-[#858174] opacity-70 cursor-not-allowed"
                    >
                      Verifying...
                    </button>
                  ) : storageState.isConnected ? (
                    <button
                      onClick={handleDisconnect}
                      disabled={actionLoading}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-[#EFA9D1] bg-[#EFA9D1]/20 hover:bg-[#EFA9D1]/40 text-xs font-bold text-[#5E193C] transition-all disabled:opacity-50 shadow-xs"
                    >
                      {actionLoading ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectGoogleDrive}
                      disabled={actionLoading}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#171717] hover:bg-[#333] text-[#F8F3E6] text-xs font-bold transition-all disabled:opacity-50 shadow-xs hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {actionLoading ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Redirecting...
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                            <polyline points="10 17 15 12 10 7" />
                            <line x1="15" y1="12" x2="3" y2="12" />
                          </svg>
                          Connect Google Drive
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Privacy & Scope Explainer Callout */}
            <div className="p-4 rounded-2xl bg-[#B7C9EA]/15 border border-[#B7C9EA]/40 flex items-start gap-3 text-xs text-[#1B2B48] font-medium leading-relaxed">
              <span className="text-base shrink-0 mt-0.5">🔒</span>
              <p>
                <strong>Privacy Guarantee:</strong> Sangam connects using the restricted{' '}
                <code className="px-1 py-0.5 bg-white/60 rounded text-[11px] font-mono">drive.file</code> scope. Sangam can
                only view and manage files and folders that the Sangam application itself creates for your coursework. It
                can never read, modify, or delete your personal files, photos, or documents.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
