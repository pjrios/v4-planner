import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ensureSampleData } from './data/seed';

const rootElement = document.getElementById('root');

if (!(rootElement instanceof HTMLElement)) {
  throw new Error('Root element #root not found');
}

const root = ReactDOM.createRoot(rootElement);

const renderApp = () => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

if (import.meta.env.DEV) {
  ensureSampleData()
    .catch((error) => {
      console.error('Failed to seed development data', error);
    })
    .finally(renderApp);
} else {
  renderApp();
}
