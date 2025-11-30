import React from 'react';
import { createRoot } from 'react-dom/client';

const Popup = () => {
    return <div>PHANTOM TABS - Popup</div>;
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
}
