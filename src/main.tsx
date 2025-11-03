import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { removeSampleData } from './data/seed';

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

const bootstrap = async () => {
  try {
    const result = await removeSampleData();
    if (result?.status === 'removed') {
      console.info(`[Planner] ${result.message}`);
    }
  } catch (error) {
    console.error('Failed to clear sample data', error);
  } finally {
    renderApp();
  }
};

void bootstrap();
