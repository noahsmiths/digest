import { Authenticated, Unauthenticated, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useAuth } from '@workos-inc/authkit-react';
import { useState } from 'react';

export default function App() {
  return (
    <>
      <header className="sticky top-0 z-10 bg-light dark:bg-dark p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        Convex + React + WorkOS AuthKit
        <AuthButton />
      </header>
      <main className="p-8 flex flex-col gap-16">
        <h1 className="text-4xl font-bold text-center">Convex + React + WorkOS AuthKit</h1>
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

function AuthButton() {
  const { user, signIn, signOut } = useAuth();

  if (user) {
    return (
      <button
        onClick={() => signOut()}
        className="bg-dark dark:bg-light text-light dark:text-dark text-sm px-4 py-2 rounded-md border-2"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={() => void signIn()}
      className="bg-dark dark:bg-light text-light dark:text-dark text-sm px-4 py-2 rounded-md border-2"
    >
      Sign in
    </button>
  );
}

function Content() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [firecrawlLiveViewURL, setFirecrawlLiveViewURL] = useState("");
  const loginToService = useAction(api.login.node.startLoginSession);
  const completeLogin = useAction(api.login.node.completeLoginSession);

  if (!firecrawlLiveViewURL) {
    return (
      <button
        disabled={isLoggingIn}
        onClick={async () => {
          setIsLoggingIn(true);

          const firecrawlURL = await loginToService({ service: "instagram" });
          setFirecrawlLiveViewURL(firecrawlURL);

          setIsLoggingIn(false);
        }}
      >
        Login to instagram
      </button>
    );
  }

  return (
    <div>
      <iframe src={firecrawlLiveViewURL} />
      <button
        onClick={async () => {
          await completeLogin({ service: "instagram" });
          alert("Saved!");
        }}
      >
        Save Login
      </button>
    </div>
  );
}
