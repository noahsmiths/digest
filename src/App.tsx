import { Authenticated, Unauthenticated, useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { AuthButton } from './auth/AuthForm';
import { DigestPage } from './ui/DigestPage';
import { LandingPage } from './ui/LandingPage';
import { SettingsPage } from './ui/SettingsPage';
import { Brand } from './ui/Chrome';
import { serviceName, type Page, type Service } from './ui/shared';

export default function App() {
  return (
    <>
      <Unauthenticated><LandingPage /></Unauthenticated>
      <Authenticated><SignedInApp /></Authenticated>
    </>
  );
}

function readPageFromURL(): Page | null {
  const query = new URLSearchParams(window.location.search);
  if (query.get('page') === 'settings' || query.get('page') === 'services') return 'settings';
  if (query.get('page') === 'digest' || query.has('digest')) return 'digest';
  return null;
}

function SignedInApp() {
  const linkedServices = useQuery(api.login.listLinkedServices);
  const { results: digests, status: paginationStatus, loadMore } = usePaginatedQuery(
    api.digests.list, {}, { initialNumItems: 10 },
  );
  const startDigest = useMutation(api.digests.start);
  const loginToService = useAction(api.login.node.startLoginSession);
  const completeLogin = useAction(api.login.node.completeLoginSession);
  const disconnectService = useAction(api.login.node.disconnectService);
  const preferences = useQuery(api.preferences.get);
  const ensurePreferences = useMutation(api.preferences.ensure);
  const updatePreferences = useMutation(api.preferences.update);
  const updateClassificationPrompt = useMutation(api.preferences.updateClassificationPrompt);

  const [pageOverride, setPageOverride] = useState<Page | null>(readPageFromURL);
  const [selectedDigestId, setSelectedDigestId] = useState<Id<'digests'> | null>(
    () => new URLSearchParams(window.location.search).get('digest') as Id<'digests'> | null,
  );
  const [loggingInService, setLoggingInService] = useState<Service | null>(null);
  const [disconnectingService, setDisconnectingService] = useState<Service | null>(null);
  const [activeService, setActiveService] = useState<Service | null>(null);
  const [firecrawlLiveViewURL, setFirecrawlLiveViewURL] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingDigest, setIsStartingDigest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasEnsuredPreferences = useRef(false);

  useEffect(() => {
    const restorePage = () => {
      setPageOverride(readPageFromURL());
      setSelectedDigestId(new URLSearchParams(window.location.search).get('digest') as Id<'digests'> | null);
    };
    window.addEventListener('popstate', restorePage);
    return () => window.removeEventListener('popstate', restorePage);
  }, []);

  useEffect(() => {
    if (preferences === undefined || hasEnsuredPreferences.current) return;
    hasEnsuredPreferences.current = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    void ensurePreferences({ timeZone });
  }, [ensurePreferences, preferences]);

  const page = pageOverride ?? (linkedServices?.length === 0 ? 'settings' : 'digest');
  const currentDigestId = selectedDigestId ?? digests[0]?._id ?? null;
  const selectedDigest = useQuery(api.digests.get, currentDigestId === null ? 'skip' : { digestId: currentDigestId });
  const activeDigest = digests.find(({ status }) => status === 'running');

  const navigate = (nextPage: Page, digestId: Id<'digests'> | null = null) => {
    setPageOverride(nextPage);
    setError(null);
    if (nextPage === 'digest' && digestId !== null) setSelectedDigestId(digestId);
    const query = new URLSearchParams(window.location.search);
    query.set('page', nextPage);
    if (nextPage === 'settings') query.delete('digest');
    else if (digestId !== null) query.set('digest', digestId);
    window.history.pushState(null, '', `${window.location.pathname}?${query.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startLogin = async (service: Service) => {
    setPageOverride('settings');
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

  const savePreferences = async ({ automaticDigestEnabled, deliveryTime }: { automaticDigestEnabled: boolean; deliveryTime: string }) => {
    setError(null);
    try {
      await updatePreferences({
        automaticDigestEnabled,
        deliveryTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
    } catch (cause) {
      console.error('Failed to save delivery settings:', cause);
      setError('Could not save your delivery settings. Try again.');
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header app-header">
        <Brand />
        <nav className="app-nav" aria-label="Main navigation">
          <button type="button" className={page === 'digest' ? 'nav-link active' : 'nav-link'} aria-current={page === 'digest' ? 'page' : undefined} onClick={() => navigate('digest')}>Digest</button>
          <button type="button" className={page === 'settings' ? 'nav-link active' : 'nav-link'} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>Settings</button>
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
          error={error}
          preferences={preferences}
          onConnect={startLogin}
          onDisconnect={disconnectFromService}
          onSave={saveLogin}
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
          onSelectDigest={(digestId) => navigate('digest', digestId)}
          onSettings={() => navigate('settings')}
        />
      )}
    </div>
  );
}
