import { Authenticated, Unauthenticated, useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useState } from 'react';
import { AuthButton } from './auth/AuthForm';

const services = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'x', name: 'X' },
  { id: 'linkedin', name: 'LinkedIn' },
] as const;

type Service = (typeof services)[number]['id'];

type ScrapedPost = {
  author: string;
  body: string;
  images: Array<{ storageId: string; url: string }>;
};

export default function App() {
  return (
    <>
      <header className="sticky top-0 z-10 bg-light dark:bg-dark p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        Convex + React + Convex Auth
        <AuthButton />
      </header>
      <main className="p-8 flex flex-col gap-16">
        <h1 className="text-4xl font-bold text-center">Convex + React + Convex Auth</h1>
        <Authenticated>
          <Content />
        </Authenticated>
        <Unauthenticated>
          <div className="flex flex-col gap-8 w-96 mx-auto">
            <p>Log in to see the numbers</p>
            <AuthButton />
          </div>
        </Unauthenticated>
      </main>
    </>
  );
}

function Content() {
  const linkedServices = useQuery(api.login.listLinkedServices);
  const [loggingInService, setLoggingInService] = useState<Service | null>(null);
  const [disconnectingService, setDisconnectingService] = useState<Service | null>(null);
  const [activeService, setActiveService] = useState<Service | null>(null);
  const [firecrawlLiveViewURL, setFirecrawlLiveViewURL] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [scrapingService, setScrapingService] = useState<Service | null>(null);
  const [maxPosts, setMaxPosts] = useState(20);
  const [scrapedPosts, setScrapedPosts] = useState<Partial<Record<Service, ScrapedPost[]>>>({});
  const [error, setError] = useState<string | null>(null);
  const loginToService = useAction(api.login.node.startLoginSession);
  const completeLogin = useAction(api.login.node.completeLoginSession);
  const disconnectService = useAction(api.login.node.disconnectService);
  const scrapeInstagram = useAction(api.scraping.instagram.scrape);
  const scrapeX = useAction(api.scraping.x.scrape);
  const scrapeLinkedIn = useAction(api.scraping.linkedin.scrape);

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
    if (activeService === null) {
      return;
    }

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
      setError('Unable to disconnect the service. Please try again.');
    } finally {
      setDisconnectingService(null);
    }
  };

  const scrapeService = async (service: Service) => {
    setScrapingService(service);
    setError(null);

    try {
      const posts = await (service === 'instagram'
        ? scrapeInstagram({ maxPosts })
        : service === 'x'
          ? scrapeX({ maxPosts })
          : scrapeLinkedIn({ maxPosts }));
      setScrapedPosts((current) => ({ ...current, [service]: posts }));
    } catch (cause) {
      console.error(`Failed to scrape ${service}:`, cause);
      setError(`Unable to scrape ${services.find(({ id }) => id === service)?.name}.`);
    } finally {
      setScrapingService(null);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Linked services</h2>
        <p className="mt-1 text-sm text-slate-500">Connect the accounts you want to use with Digest.</p>
      </div>

      <label className="flex items-center gap-3 text-sm">
        Posts to scrape
        <input
          className="w-20 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700"
          type="number"
          min={1}
          value={maxPosts}
          onChange={(event) => setMaxPosts(Number(event.target.value))}
        />
      </label>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {services.map((service) => {
          const isConnected = linkedServices?.includes(service.id) ?? false;
          const isStarting = loggingInService === service.id;
          const isDisconnecting = disconnectingService === service.id;

          return (
            <li className="flex items-center justify-between gap-4 p-4" key={service.id}>
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-slate-500">{isConnected ? 'Connected' : 'Not connected'}</p>
              </div>
              <div className="flex gap-2">
                {isConnected && (
                  <button
                    className="rounded-md bg-slate-950 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
                    type="button"
                    disabled={scrapingService !== null || maxPosts < 1}
                    onClick={() => void scrapeService(service.id)}
                  >
                    {scrapingService === service.id ? 'Scraping…' : 'Scrape feed'}
                  </button>
                )}
                <button
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
                  type="button"
                  disabled={
                    linkedServices === undefined ||
                    loggingInService !== null ||
                    disconnectingService !== null ||
                    activeService !== null ||
                    isSaving ||
                    scrapingService !== null
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
                      : 'Log in'}
                </button>
              </div>
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
            className="h-[32rem] w-full rounded-xl border border-slate-200 dark:border-slate-800"
            src={firecrawlLiveViewURL}
            title={`${services.find(({ id }) => id === activeService)?.name} login`}
          />
          <button
            className="self-end rounded-md bg-slate-950 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
            type="button"
            disabled={isSaving}
            onClick={() => void saveLogin()}
          >
            {isSaving ? 'Saving…' : 'Save login'}
          </button>
        </div>
      )}

      {services.map((service) => {
        const posts = scrapedPosts[service.id];
        if (posts === undefined) {
          return null;
        }
        return (
          <section className="flex flex-col gap-4" key={`${service.id}-results`}>
            <h3 className="text-xl font-semibold">
              {service.name} feed ({posts.length})
            </h3>
            {posts.map((post, index) => (
              <article
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                key={`${post.author}-${index}`}
              >
                <p className="font-semibold">{post.author}</p>
                {post.body !== '' && <p className="whitespace-pre-wrap text-sm">{post.body}</p>}
                {post.images.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {post.images.map((image) => (
                      <img
                        className="h-56 w-full rounded-lg object-cover"
                        key={image.storageId}
                        src={image.url}
                        alt=""
                      />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        );
      })}
    </section>
  );
}
