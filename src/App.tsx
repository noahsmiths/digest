import { Authenticated, Unauthenticated, useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { AuthButton } from './auth/AuthForm';
import { DigestPage, type DigestData } from './ui/DigestPage';
import { LandingPage } from './ui/LandingPage';
import { ServicesPage } from './ui/ServicesPage';
import { Brand } from './ui/Chrome';
import { serviceName, type Category, type Page, type Service } from './ui/shared';

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
  if (query.get('page') === 'services') return 'services';
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

  useEffect(() => {
    const restorePage = () => {
      setPageOverride(readPageFromURL());
      setSelectedDigestId(new URLSearchParams(window.location.search).get('digest') as Id<'digests'> | null);
    };
    window.addEventListener('popstate', restorePage);
    return () => window.removeEventListener('popstate', restorePage);
  }, []);

  const page = pageOverride ?? (linkedServices?.length === 0 ? 'services' : 'digest');
  const currentDigestId = selectedDigestId ?? digests[0]?._id ?? null;
  const selectedDigest = useQuery(api.digests.get, currentDigestId === null ? 'skip' : { digestId: currentDigestId });
  const activeDigest = digests.find(({ status }) => status === 'running');
  const groupedPosts = useMemo(() => {
    const grouped: Record<Category, DigestData['posts']> = { social: [], event: [] };
    if (selectedDigest === undefined || selectedDigest === null) return grouped;
    for (const post of selectedDigest.posts) {
      if (post.category === 'social' || post.category === 'event') grouped[post.category].push(post);
    }
    return grouped;
  }, [selectedDigest]);

  const navigate = (nextPage: Page, digestId: Id<'digests'> | null = null) => {
    setPageOverride(nextPage);
    setError(null);
    if (nextPage === 'digest' && digestId !== null) setSelectedDigestId(digestId);
    const query = new URLSearchParams(window.location.search);
    query.set('page', nextPage);
    if (nextPage === 'services') query.delete('digest');
    else if (digestId !== null) query.set('digest', digestId);
    window.history.pushState(null, '', `${window.location.pathname}?${query.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startLogin = async (service: Service) => {
    setPageOverride('services');
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

  return (
    <div className="app-shell">
      <header className="site-header app-header">
        <Brand />
        <nav className="app-nav" aria-label="Main navigation">
          <button type="button" className={page === 'digest' ? 'nav-link active' : 'nav-link'} aria-current={page === 'digest' ? 'page' : undefined} onClick={() => navigate('digest')}>Digest</button>
          <button type="button" className={page === 'services' ? 'nav-link active' : 'nav-link'} aria-current={page === 'services' ? 'page' : undefined} onClick={() => navigate('services')}>Connections</button>
        </nav>
        <AuthButton className="header-auth" />
      </header>

      {linkedServices === undefined ? (
        <main className="app-loading" aria-live="polite">Opening your reading space…</main>
      ) : page === 'services' ? (
        <ServicesPage
          linkedServices={linkedServices}
          activeService={activeService}
          firecrawlLiveViewURL={firecrawlLiveViewURL}
          loggingInService={loggingInService}
          disconnectingService={disconnectingService}
          isSaving={isSaving}
          error={error}
          onConnect={startLogin}
          onDisconnect={disconnectFromService}
          onSave={saveLogin}
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
          groupedPosts={groupedPosts}
          activeDigest={activeDigest}
          isStartingDigest={isStartingDigest}
          error={error}
          onGenerate={generateDigest}
          onSelectDigest={(digestId) => navigate('digest', digestId)}
          onServices={() => navigate('services')}
        />
      )}
    </div>
  );
}
