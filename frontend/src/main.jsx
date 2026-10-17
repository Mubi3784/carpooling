import './lib/installPrompt.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { AlertProvider } from './context/AlertContext.jsx';
import { ChatUnreadProvider } from './context/ChatUnreadContext.jsx';
import { ModeProvider } from './context/ModeContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AlertProvider>
          <ChatUnreadProvider>
            <ModeProvider>
              <App />
            </ModeProvider>
          </ChatUnreadProvider>
        </AlertProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);