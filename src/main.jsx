import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import SetupRequired from './components/SetupRequired';
import './index.css';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* reducedMotion="user": framer-motion skips transform/layout animations when the OS asks for reduced motion. */}
    <MotionConfig reducedMotion="user">
      {clientId ? (
        <GoogleOAuthProvider clientId={clientId}>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </GoogleOAuthProvider>
      ) : (
        <SetupRequired />
      )}
    </MotionConfig>
  </React.StrictMode>,
);
