import { useAuthActions } from '@convex-dev/auth/react';
import { useOauth, useSignInWithGithub, type OauthFlowErrorCode } from '@convex-dev/auth/providers/oauth/react';
import { useSignInWithPassword, useSignUpWithPassword } from '@convex-dev/auth/providers/password/react';
import { useConvexAuth } from 'convex/react';
import { useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';
import { Modal } from '../ui/Modal';

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
      if (!result.success) setError(messageForPasswordError(result.userError));
    } catch (cause) {
      console.error('Email authentication failed:', cause);
      setError('Sign-in is unavailable right now. Please try again.');
    }
  };

  return (
    <div className="auth-form">
      <div className="auth-heading">
        <h2>{isSignUp ? 'Welcome.' : 'Welcome back.'}</h2>
        <p>{isSignUp ? 'Create an account to connect your services.' : 'Sign in to read your Digest.'}</p>
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={pending} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignUp ? 'new-password' : 'current-password'} required disabled={pending} />
        </label>
        {error !== null && <p role="alert" className="auth-error">{error}</p>}
        <button className="primary-action auth-submit" disabled={pending}>
          {pending ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <div className="auth-divider"><span>or</span></div>
      <button className="auth-github" type="button" onClick={() => void signInGithub().catch(() => {})}>Continue with GitHub</button>
      {flowError !== null && <p role="alert" className="auth-error">{flowError.message ?? oauthErrors[flowError.code]}</p>}
      <button className="auth-switch" type="button" onClick={() => { setIsSignUp((current) => !current); setError(null); }}>
        {isSignUp ? 'Already have an account? Sign in' : 'New to Digest? Create an account'}
      </button>
    </div>
  );
}

export function AuthButton({ label, className = '' }: { label?: string; className?: string }) {
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (isAuthenticated) {
    return <button className={className} type="button" onClick={() => void signOut()}>Sign out</button>;
  }

  return (
    <>
      <button className={className} type="button" disabled={isLoading} onClick={() => setIsOpen(true)}>{label ?? 'Sign in'}</button>
      {isOpen && <Modal className="auth-dialog" label="Sign in to Digest" onClose={() => setIsOpen(false)}><AuthForm /></Modal>}
    </>
  );
}

function messageForPasswordError(error: {
  error: string;
  minimumLength?: number;
  maximumLength?: number;
  retryAfterMs?: number;
}) {
  switch (error.error) {
    case 'USERNAME_TAKEN': return 'An account already exists for that email.';
    case 'USER_NOT_FOUND': return 'No account exists for that email.';
    case 'INVALID_CREDENTIALS': return 'Incorrect email or password.';
    case 'USERNAME_TOO_SHORT':
    case 'USERNAME_HAS_SURROUNDING_WHITESPACE':
    case 'USERNAME_HAS_INVALID_CHARACTERS': return 'Enter a valid email address.';
    case 'PASSWORD_TOO_SHORT': return `Password must be at least ${error.minimumLength} characters.`;
    case 'PASSWORD_TOO_LONG': return `Password must be at most ${error.maximumLength} characters.`;
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE': return "Password can't start or end with whitespace.";
    case 'PASSWORD_TOO_COMMON': return 'Choose a less common password.';
    case 'RATE_LIMITED': return `Too many attempts. Try again in ${Math.ceil((error.retryAfterMs ?? 0) / 1000)} seconds.`;
    default: return 'Something went wrong. Please try again.';
  }
}
