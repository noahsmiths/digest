import { Authenticated, Unauthenticated, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useState } from 'react';
import { AuthButton } from './auth/AuthForm';

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
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [firecrawlLiveViewURL, setFirecrawlLiveViewURL] = useState('');
  const loginToService = useAction(api.login.node.startLoginSession);
  const completeLogin = useAction(api.login.node.completeLoginSession);

  if (!firecrawlLiveViewURL) {
    return (
      <button
        disabled={isLoggingIn}
        onClick={() =>
          void (async () => {
            setIsLoggingIn(true);

            const firecrawlURL = await loginToService({ service: 'instagram' });
            setFirecrawlLiveViewURL(firecrawlURL);

            setIsLoggingIn(false);
          })()
        }
      >
        Login to instagram
      </button>
    );
  }

  return (
    <div>
      <iframe src={firecrawlLiveViewURL} />
      <button
        onClick={() =>
          void (async () => {
            await completeLogin({ service: 'instagram' });
            alert('Saved!');
          })()
        }
      >
        Save Login
      </button>
    </div>
  );
}
