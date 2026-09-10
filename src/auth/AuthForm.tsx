import { useAuthActions } from '@convex-dev/auth/react';
import { useOauth, useSignInWithGithub, type OauthFlowErrorCode } from '@convex-dev/auth/providers/oauth/react';
import { useSignInWithPassword, useSignUpWithPassword } from '@convex-dev/auth/providers/password/react';
import { useConvexAuth } from 'convex/react';
import { useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';

const oauthErrors: Record<OauthFlowErrorCode, string> = {
  access_denied: 'Sign-in was cancelled.',
  expired: 'That sign-in took too long. Please try again.',
  rejected: 'Sign-in was declined.',
  oauth_error: 'GitHub sign-in failed. Please try again.',
  invalid_flow: "This sign-in can't be completed here. Please try again.",
};

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { signIn, pending: signingIn } = useSignInWithPassword(api.auth.signInWithPassword);
  const { signUp, pending: signingUp } = useSignUpWithPassword(api.auth.signUpWithPassword);
  const { signInGithub } = useSignInWithGithub(api.auth);
  const { flowError } = useOauth();
  const pending = signingIn || signingUp;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const result = isSignUp
        ? await signUp({ username: email, password })
        : await signIn({ username: email, password });
      if (!result.success) {
        setError(messageForPasswordError(result.userError));
      }
    } catch (cause) {
      console.error('Email authentication failed:', cause);
      setError('Something went wrong. Please try again.');
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-5 rounded-xl border border-slate-300 p-6 dark:border-slate-700">
      <div>
        <h2 className="text-2xl font-semibold">{isSignUp ? 'Create an account' : 'Welcome back'}</h2>
        <p className="mt-1 text-sm text-slate-500">Use your email or continue with GitHub.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            className="rounded-md border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={pending}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            className="rounded-md border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            disabled={pending}
          />
        </label>
        {error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          className="rounded-md bg-slate-950 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
          disabled={pending}
        >
          {pending ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
        or
        <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
      </div>

      <button
        className="rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700"
        type="button"
        onClick={() => void signInGithub().catch(() => {})}
      >
        Continue with GitHub
      </button>
      {flowError !== null && (
        <p role="alert" className="text-sm text-red-600">
          {flowError.message ?? oauthErrors[flowError.code]}
        </p>
      )}

      <button
        className="text-sm underline"
        type="button"
        onClick={() => {
          setIsSignUp((current) => !current);
          setError(null);
        }}
      >
        {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
      </button>
    </section>
  );
}

export function AuthButton() {
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <>
        <button
          className="bg-dark dark:bg-light text-light dark:text-dark text-sm px-4 py-2 rounded-md border-2"
          type="button"
          disabled={isLoading}
          onClick={() => setIsOpen(true)}
        >
          Sign in
        </button>
        {isOpen && (
          <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4">
            <div
              className="relative w-full max-w-sm rounded-xl bg-light p-2 text-dark dark:bg-dark dark:text-light"
              role="dialog"
              aria-modal="true"
              aria-label="Sign in"
            >
              <button
                className="absolute right-4 top-4 z-10 text-sm underline"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
              <AuthForm />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <button
      className="bg-dark dark:bg-light text-light dark:text-dark text-sm px-4 py-2 rounded-md border-2"
      type="button"
      onClick={() => void signOut()}
    >
      Sign out
    </button>
  );
}

function messageForPasswordError(error: {
  error: string;
  minimumLength?: number;
  maximumLength?: number;
  retryAfterMs?: number;
}) {
  switch (error.error) {
    case 'USERNAME_TAKEN':
      return 'An account already exists for that email.';
    case 'USER_NOT_FOUND':
      return 'No account exists for that email.';
    case 'INVALID_CREDENTIALS':
      return 'Incorrect email or password.';
    case 'USERNAME_TOO_SHORT':
    case 'USERNAME_HAS_SURROUNDING_WHITESPACE':
    case 'USERNAME_HAS_INVALID_CHARACTERS':
      return 'Enter a valid email address.';
    case 'PASSWORD_TOO_SHORT':
      return `Password must be at least ${error.minimumLength} characters.`;
    case 'PASSWORD_TOO_LONG':
      return `Password must be at most ${error.maximumLength} characters.`;
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE':
      return "Password can't start or end with whitespace.";
    case 'PASSWORD_TOO_COMMON':
      return 'Choose a less common password.';
    case 'RATE_LIMITED':
      return `Too many attempts. Try again in ${Math.ceil((error.retryAfterMs ?? 0) / 1000)} seconds.`;
    default:
      return 'Something went wrong. Please try again.';
  }
}
