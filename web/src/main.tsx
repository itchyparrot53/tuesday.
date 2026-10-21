import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import App from './App';
import { queryClient } from './lib/queryClient';
import { ToastProvider } from './components/ui/Toast';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={300}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </Tooltip.Provider>
    </QueryClientProvider>
  </StrictMode>,
);
