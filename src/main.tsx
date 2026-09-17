import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { BrowserRouter } from 'react-router';
import { api } from '../convex/_generated/api';
import '@fontsource/alegreya/latin-400.css';
import '@fontsource/alegreya/latin-400-italic.css';
import '@fontsource/alegreya/latin-500.css';
import '@fontsource/alegreya/latin-600.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './index.css';
import App from './App.tsx';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const root = document.getElementById('root');

if (root === null) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <ConvexAuthProvider client={convex} api={api.auth}>
      <BrowserRouter basename={import.meta.env.BASE_URL}><App /></BrowserRouter>
    </ConvexAuthProvider>
  </StrictMode>,
);
