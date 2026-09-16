import { Authenticated, Unauthenticated, useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { AuthButton } from './auth/AuthForm';

const services = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'x', name: 'X' },
  { id: 'linkedin', name: 'LinkedIn' },
] as const;

const categories = [
  { id: 'social', name: 'Social' },
  { id: 'event', name: 'Upcoming events' },
] as const;

type Service = (typeof services)[number]['id'];
type Category = (typeof categories)[number]['id'];

function serviceName(service: Service) {
  return services.find(({ id }) => id === service)?.name ?? service;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

function statusLabel(status: 'running' | 'completed' | 'partial' | 'failed') {
  if (status === 'running') return 'Running';
  if (status === 'completed') return 'Complete';
  if (status === 'partial') return 'Complete with warnings';
  return 'Failed';
}

export default function App() {
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <span className="text-lg font-semibold tracking-tight">Digest</span>
        <AuthButton />
      </header>
      <main className="mx-auto w-full max-w-6xl p-5 sm:p-8">
        <Authenticated>
          <Content />
        </Authenticated>
        <Unauthenticated>
          <section className="mx-auto flex max-w-lg flex-col items-center gap-5 py-24 text-center">
            <h1 className="text-4xl font-bold tracking-tight">Your feeds, sorted into one digest.</h1>
            <p className="text-slate-500">Sign in to connect your services and generate a categorized digest.</p>
            <AuthButton />
          </section>
        </Unauthenticated>
      </main>
    </>
  );
}

function Content() {
  const linkedServices = useQuery(api.login.listLinkedServices);
  const {
    results: digests,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(api.digests.list, {}, { initialNumItems: 10 });
  const startDigest = useMutation(api.digests.start);
  const loginToService = useAction(api.login.node.startLoginSession);
  const completeLogin = useAction(api.login.node.completeLoginSession);
  const disconnectService = useAction(api.login.node.disconnectService);
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
  const currentDigestId = selectedDigestId ?? digests[0]?._id ?? null;
  const selectedDigest = useQuery(api.digests.get, currentDigestId === null ? 'skip' : { digestId: currentDigestId });
  const activeDigest = digests.find(({ status }) => status === 'running');

  const groupedPosts = useMemo(() => {
    const grouped: Record<Category, NonNullable<typeof selectedDigest>['posts']> = {
      social: [],
      event: [],
    };
    if (selectedDigest === undefined || selectedDigest === null) return grouped;
    for (const post of selectedDigest.posts) {
      if (post.category === 'social' || post.category === 'event') grouped[post.category].push(post);
    }
    return grouped;
  }, [selectedDigest]);

  const startLogin = async (service: Service) => {
    setLoggingInService(service);
    setError(null);
    try {
      const firecrawlURL = await loginToService({ service });
      setActiveService(service);
      setFirecrawlLiveViewURL(firecrawlURL);
    } catch (cause) {
      console.error(`Failed to start ${service} login:`, cause);
      setError('Unable to start the login session. Please try again.');
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
      setError('Unable to save the login session. Please try again.');
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
      setError(`Unable to disconnect ${serviceName(service)}. Please try again.`);
    } finally {
      setDisconnectingService(null);
    }
  };

  const generateDigest = async () => {
    setIsStartingDigest(true);
    setError(null);
    try {
      setSelectedDigestId(await startDigest({}));
    } catch (cause) {
      console.error('Failed to start digest:', cause);
      setError('Unable to start the digest. Connect at least one service and try again.');
    } finally {
      setIsStartingDigest(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connected services</h1>
            <p className="mt-1 text-sm text-slate-500">
              Each digest collects up to 50 posts from every connected feed.
            </p>
          </div>
          <button
            className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
            type="button"
            disabled={
              linkedServices === undefined ||
              linkedServices.length === 0 ||
              isStartingDigest ||
              activeDigest !== undefined
            }
            onClick={() => void generateDigest()}
          >
            {isStartingDigest ? 'Starting…' : activeDigest === undefined ? 'Generate digest' : 'Digest running…'}
          </button>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3">
          {services.map((service) => {
            const isConnected = linkedServices?.includes(service.id) ?? false;
            const isStarting = loggingInService === service.id;
            const isDisconnecting = disconnectingService === service.id;
            return (
              <li
                className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                key={service.id}
              >
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-xs text-slate-500">{isConnected ? 'Connected' : 'Not connected'}</p>
                </div>
                <button
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-600"
                  type="button"
                  disabled={
                    linkedServices === undefined ||
                    loggingInService !== null ||
                    disconnectingService !== null ||
                    activeService !== null ||
                    isSaving
                  }
                  onClick={
                    isConnected ? () => void disconnectFromService(service.id) : () => void startLogin(service.id)
                  }
                >
                  {isConnected
                    ? isDisconnecting
                      ? 'Disconnecting…'
                      : 'Disconnect'
                    : isStarting
                      ? 'Opening…'
                      : 'Connect'}
                </button>
              </li>
            );
          })}
        </ul>

        {error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {activeService !== null && firecrawlLiveViewURL !== '' && (
          <div className="flex flex-col gap-4">
            <iframe
              className="h-[32rem] w-full rounded-xl border border-slate-200 dark:border-slate-700"
              src={firecrawlLiveViewURL}
              title={`${serviceName(activeService)} login`}
            />
            <button
              className="self-end rounded-lg bg-slate-950 px-5 py-2.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
              type="button"
              disabled={isSaving}
              onClick={() => void saveLogin()}
            >
              {isSaving ? 'Saving…' : 'Save login'}
            </button>
          </div>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="px-2 pb-3 text-lg font-semibold">Digest history</h2>
          {paginationStatus === 'LoadingFirstPage' ? (
            <p className="px-2 py-6 text-sm text-slate-500">Loading digests…</p>
          ) : digests.length === 0 ? (
            <p className="px-2 py-6 text-sm text-slate-500">Your generated digests will appear here.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {digests.map((digest) => (
                <li key={digest._id}>
                  <button
                    className={`w-full rounded-xl px-3 py-3 text-left transition ${currentDigestId === digest._id ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                    type="button"
                    onClick={() => setSelectedDigestId(digest._id)}
                  >
                    <span className="block text-sm font-medium">{formatDate(digest._creationTime)}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{statusLabel(digest.status)}</span>
                      <span>{digest.postCount} posts</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(paginationStatus === 'CanLoadMore' || paginationStatus === 'LoadingMore') && (
            <button
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
              type="button"
              disabled={paginationStatus === 'LoadingMore'}
              onClick={() => loadMore(10)}
            >
              {paginationStatus === 'LoadingMore' ? 'Loading…' : 'Load more'}
            </button>
          )}
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          {currentDigestId === null ? (
            <div className="py-20 text-center text-slate-500">Generate a digest to see it here.</div>
          ) : selectedDigest === undefined ? (
            <div className="py-20 text-center text-slate-500">Loading digest…</div>
          ) : selectedDigest === null ? (
            <div className="py-20 text-center text-slate-500">This digest is unavailable.</div>
          ) : (
            <DigestDetail digest={selectedDigest.digest} groupedPosts={groupedPosts} />
          )}
        </section>
      </div>
    </div>
  );
}

type DigestDetailResult = NonNullable<ReturnType<typeof useQuery<typeof api.digests.get>>>;

function DigestDetail({
  digest,
  groupedPosts,
}: {
  digest: DigestDetailResult['digest'];
  groupedPosts: Record<Category, DigestDetailResult['posts']>;
}) {
  const failedServices = digest.serviceResults.filter(({ status }) => status === 'failed');
  const completedServices = digest.serviceResults.filter(({ status }) => status !== 'pending').length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-2xl font-semibold">{formatDate(digest._creationTime)}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {digest.postCount} posts from {digest.serviceResults.length} services
          </p>
        </div>
        <span
          className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${digest.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : digest.status === 'running' ? 'bg-blue-100 text-blue-700' : digest.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}
        >
          {statusLabel(digest.status)}
        </span>
      </div>

      {digest.status === 'running' && (
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          {digest.stage === 'scraping'
            ? `Scraping connected services (${completedServices}/${digest.serviceResults.length})…`
            : 'Categorizing posts with GPT-5…'}
        </div>
      )}
      {failedServices.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Could not scrape {failedServices.map(({ service }) => serviceName(service)).join(', ')}. The available
          services are still included.
        </div>
      )}
      {digest.classificationFallbackCount > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {digest.classificationFallbackCount} posts were omitted because GPT-5 could not categorize their batch.
        </div>
      )}
      {digest.status === 'failed' && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          This digest could not be completed. Generate a new digest after checking your connected services.
        </div>
      )}

      {(digest.status === 'completed' || digest.status === 'partial') &&
        categories.map((category) => (
          <section className="flex flex-col gap-3" key={category.id}>
            <h3 className="flex items-baseline justify-between border-b border-slate-200 pb-2 text-xl font-semibold dark:border-slate-700">
              {category.name}
              <span className="text-sm font-normal text-slate-500">{groupedPosts[category.id].length}</span>
            </h3>
            {groupedPosts[category.id].length === 0 ? (
              <p className="py-4 text-sm text-slate-500">No posts in this category.</p>
            ) : (
              groupedPosts[category.id].map((post) => <DigestPost key={post._id} post={post} />)
            )}
          </section>
        ))}
    </div>
  );
}

function DigestPost({ post }: { post: DigestDetailResult['posts'][number] }) {
  const [arePhotosExpanded, setArePhotosExpanded] = useState(false);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{post.author}</p>
        <span className="text-xs uppercase tracking-wide text-slate-400">{serviceName(post.service)}</span>
      </div>
      {post.body !== '' && <p className="whitespace-pre-wrap text-sm leading-6">{post.body}</p>}
      {post.images.length > 0 && (
        <div>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-600"
            type="button"
            aria-expanded={arePhotosExpanded}
            aria-controls={`post-photos-${post._id}`}
            onClick={() => setArePhotosExpanded((isExpanded) => !isExpanded)}
          >
            {arePhotosExpanded ? 'Hide photos' : `Photos (${post.images.length})`}
          </button>
          {arePhotosExpanded && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" id={`post-photos-${post._id}`}>
              {post.images.map((image) => (
                <img className="max-h-96 w-full rounded-lg object-cover" key={image.storageId} src={image.url} alt="" />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
