import { createRoot } from 'react-dom/client';

import './index.css';
import App from './App';

const container = document.getElementById('root');
// biome-ignore lint/style/noNonNullAssertion: root element exists in index.html
const root = createRoot(container!);
root.render(<App />);
