import { Authenticated, Unauthenticated, useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useState } from 'react';
import { AuthButton } from './auth/AuthForm';

const services = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'x', name: 'X' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'linkedin', name: 'LinkedIn' },
] as const;

type Service = (typeof services)[number]['id'];

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
  const [activeService, setActiveService] = useState<Service | null>(null);
  const [firecrawlLiveViewURL, setFirecrawlLiveViewURL] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginToService = useAction(api.login.node.startLoginSession);
  const completeLogin = useAction(api.login.node.completeLoginSession);

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

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Linked services</h2>
        <p className="mt-1 text-sm text-slate-500">Connect the accounts you want to use with Digest.</p>
      </div>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {services.map((service) => {
          const isConnected = linkedServices?.includes(service.id) ?? false;
          const isStarting = loggingInService === service.id;

          return (
            <li className="flex items-center justify-between gap-4 p-4" key={service.id}>
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-slate-500">{isConnected ? 'Connected' : 'Not connected'}</p>
              </div>
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
                type="button"
                disabled={
                  linkedServices === undefined || loggingInService !== null || activeService !== null || isSaving
                }
                onClick={isConnected ? undefined : () => void startLogin(service.id)}
              >
                {isConnected ? 'Disconnect' : isStarting ? 'Opening…' : 'Log in'}
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
    </section>
  );
}
