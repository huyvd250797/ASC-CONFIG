import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './lib/toast';
import { PinProvider } from './lib/pin';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <PinProvider>
        <App />
      </PinProvider>
    </ToastProvider>
  </StrictMode>,
);
