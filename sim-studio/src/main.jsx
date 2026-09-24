import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PackagedPlayer from './learner/PackagedPlayer.jsx';
import './studio/styles.css';
import './learner/learner.css';

// A SCORM package bakes the simulation into window.__GK_PACKAGE__ and runs only the player.
const pkg = typeof window !== 'undefined' ? window.__GK_PACKAGE__ : null;
createRoot(document.getElementById('root')).render(pkg ? <PackagedPlayer pkg={pkg} /> : <App />);
