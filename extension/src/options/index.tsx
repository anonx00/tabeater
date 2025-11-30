import React from 'react';
import { createRoot } from 'react-dom/client';

const Options = () => {
    return <div>PHANTOM TABS - Options</div>;
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Options />);
}
