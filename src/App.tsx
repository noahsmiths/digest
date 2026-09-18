import { useAction, useConvexAuth, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { AuthButton } from './auth/AuthForm';
import { DigestPage } from './ui/DigestPage';
import { LandingPage } from './ui/LandingPage';
import { SettingsPage } from './ui/SettingsPage';
import { Brand } from './ui/Chrome';
import { serviceName, type Page, type Service } from './ui/shared';
import { digestPath } from '../shared/routes';

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = pathname === '/settings' ? 'Settings · Digest' : pathname.startsWith('/digest') ? 'Your digest · Digest' : 'Digest';
  }, [pathname]);

  if (isLoading) return <AppLoading />;
  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <HomeRedirect /> : <LandingPage />} />
      <Route element={isAuthenticated ? <Outlet /> : <LandingPage />}>
        <Route path="/digest" element={<SignedInApp page="digest" />} />
        <Route path="/digest/:digestId" element={<SignedInApp page="digest" />} />
        <Route path="/settings" element={<SignedInApp page="settings" />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function AppLoading() {
  return <div className="app-shell"><header className="site-header app-header"><Brand /></header><main className="app-loading" aria-live="polite">Opening your reading space…</main></div>;
}

function HomeRedirect() {
  const linkedServices = useQuery(api.login.listLinkedServices);
  if (linkedServices === undefined) return <AppLoading />;
  return <Navigate to={linkedServices.length === 0 ? '/settings' : '/digest'} replace />;
}

function NotFoundPage() {
  return (
    <div className="app-shell">
      <header className="site-header app-header"><Brand /><AuthButton className="header-auth" /></header>
      <main className="page-frame">
        <div className="page-heading"><div><h1>Page not found.</h1><p>This address doesn’t point to a page in Digest.</p></div></div>
        <Link className="text-action" to="/">Return to Digest</Link>
      </main>
    </div>
  );
}

function SignedInApp({ page }: { page: Page }) {
  const routerNavigate = useNavigate();
  const { pathname } = useLocation();
  const { digestId } = useParams<{ digestId: string }>();
  const linkedServices = useQuery(api.login.listLinkedServices);
  const { results: digests, status: paginationStatus, loadMore } = usePaginatedQuery(
    api.digests.list, {}, { initialNumItems: 10 },
  );
  const startDigest = useMutation(api.digests.start);
  const loginToService = useAction(api.login.node.startLoginSession);
  const completeLogin = useAction(api.login.node.completeLoginSession);
  const cancelLoginSession = useAction(api.login.node.cancelLoginSession);
  const disconnectService = useAction(api.login.node.disconnectService);
  const preferences = useQuery(api.preferences.get);
  const ensurePreferences = useMutation(api.preferences.ensure);
  const updatePreferences = useMutation(api.preferences.update);
  const updateClassificationPrompt = useMutation(api.preferences.updateClassificationPrompt);

  const [loggingInService, setLoggingInService] = useState<Service | null>(null);
  const [disconnectingService, setDisconnectingService] = useState<Service | null>(null);
  const [activeService, setActiveService] = useState<Service | null>(null);
  const [firecrawlLiveViewURL, setFirecrawlLiveViewURL] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isStartingDigest, setIsStartingDigest] = useState(false);
  const [pageError, setPageError] = useState<{ pathname: string; message: string } | null>(null);
  const error = pageError?.pathname === pathname ? pageError.message : null;
  const setError = (message: string | null) => setPageError(message === null ? null : { pathname, message });
  const hasEnsuredPreferences = useRef(false);

  useEffect(() => {
    if (preferences === undefined || hasEnsuredPreferences.current) return;
    hasEnsuredPreferences.current = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    void ensurePreferences({ timeZone });
  }, [ensurePreferences, preferences]);

  const currentDigestId = digestId ?? digests[0]?._id ?? null;
  const selectedDigest = useQuery(api.digests.get, page !== 'digest' || currentDigestId === null ? 'skip' : { digestId: currentDigestId });
  const activeDigest = digests.find(({ status }) => status === 'running');

  const navigate = (nextPage: Page, digestId: Id<'digests'> | null = null) => {
    setError(null);
    void routerNavigate(nextPage === 'settings' ? '/settings' : digestId === null ? '/digest' : digestPath(digestId));
  };

  const startLogin = async (service: Service) => {
    setLoggingInService(service);
    setError(null);
    try {
      const url = await loginToService({ service });
      setActiveService(service);
      setFirecrawlLiveViewURL(url);
    } catch (cause) {
      console.error(`Failed to start ${service} login:`, cause);
      setError(`Could not open ${serviceName(service)}. Try connecting it again.`);
    } finally {
      setLoggingInService(null);
    }
  };

  const saveLogin = async () => {
    if (activeService === null) return;
    setIsSaving(true);
    setError(null);
    try {
      await completeLogin({ service: activeService });
      setActiveService(null);
      setFirecrawlLiveViewURL('');
    } catch (cause) {
      console.error(`Failed to save ${activeService} login:`, cause);
      setError(`Could not save ${serviceName(activeService)}. Check the login and try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  const disconnectFromService = async (service: Service) => {
    setDisconnectingService(service);
    setError(null);
    try {
      await disconnectService({ service });
    } catch (cause) {
      console.error(`Failed to disconnect ${service}:`, cause);
      setError(`Could not disconnect ${serviceName(service)}. Try again.`);
    } finally {
      setDisconnectingService(null);
    }
  };

  const cancelLogin = async () => {
    if (activeService === null) return;
    setIsCancelling(true);
    setError(null);
    try {
      await cancelLoginSession({ service: activeService });
      setActiveService(null);
      setFirecrawlLiveViewURL('');
    } catch (cause) {
      console.error(`Failed to cancel ${activeService} login:`, cause);
      setError('Could not close the login session. Try cancelling again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const generateDigest = async () => {
    setIsStartingDigest(true);
    setError(null);
    try {
      navigate('digest', await startDigest({}));
    } catch (cause) {
      console.error('Failed to start digest:', cause);
      setError('Could not start a digest. Check that a service is connected and try again.');
    } finally {
      setIsStartingDigest(false);
    }
  };

  const savePreferences = async ({ automaticDigestEnabled, emailAfterDigestEnabled, deliveryTime }: { automaticDigestEnabled: boolean; emailAfterDigestEnabled: boolean; deliveryTime: string }) => {
    setError(null);
    try {
      await updatePreferences({
        automaticDigestEnabled,
        emailAfterDigestEnabled,
        deliveryTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
    } catch (cause) {
      console.error('Failed to save email settings:', cause);
      throw cause;
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header app-header">
        <Brand />
        <nav className="app-nav" aria-label="Main navigation">
          <NavLink to="/digest" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setError(null)}>My Digests</NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setError(null)}>Settings</NavLink>
        </nav>
        <AuthButton className="header-auth" />
      </header>

      {linkedServices === undefined || preferences === undefined ? (
        <main className="app-loading" aria-live="polite">Opening your reading space…</main>
      ) : page === 'settings' ? (
        <SettingsPage
          linkedServices={linkedServices}
          activeService={activeService}
          firecrawlLiveViewURL={firecrawlLiveViewURL}
          loggingInService={loggingInService}
          disconnectingService={disconnectingService}
          isSaving={isSaving}
          isCancelling={isCancelling}
          error={error}
          preferences={preferences}
          onConnect={startLogin}
          onDisconnect={disconnectFromService}
          onSave={saveLogin}
          onCancel={cancelLogin}
          onSavePreferences={savePreferences}
          onSaveClassificationPrompt={async (classificationPrompt) => { await updateClassificationPrompt({ classificationPrompt }); }}
          onDigest={() => navigate('digest')}
        />
      ) : (
        <DigestPage
          linkedServices={linkedServices}
          digests={digests}
          paginationStatus={paginationStatus}
          loadMore={loadMore}
          currentDigestId={currentDigestId}
          selectedDigest={selectedDigest}
          activeDigest={activeDigest}
          isStartingDigest={isStartingDigest}
          error={error}
          onGenerate={generateDigest}
        />
      )}
    </div>
  );
}
