import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// On Replit, the frontend and API share one origin (proxied under /api), so
// no base URL is needed. When deployed as separate services (e.g. Render),
// set VITE_API_BASE_URL to the API service's full URL.
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById('root')!).render(<App />);
