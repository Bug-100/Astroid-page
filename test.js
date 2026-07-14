const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('d:/WB_Prop_page/index.html', 'utf8');
const js = fs.readFileSync('d:/WB_Prop_page/script.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "outside-only" });
const window = dom.window;
const document = window.document;

// Mock window.innerHeight/innerWidth
window.innerHeight = 800;
window.innerWidth = 600;

// Catch console errors/logs
window.console.log = (...args) => console.log('LOG:', ...args);
window.console.warn = (...args) => console.log('WARN:', ...args);
window.console.error = (...args) => console.log('ERROR:', ...args);
window.console.group = () => {};
window.console.groupEnd = () => {};

// Mock requestAnimationFrame
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock getBoundingClientRect
window.HTMLElement.prototype.getBoundingClientRect = function() {
    return { top: 0, left: 0, width: 100, height: 100 };
};

// Mock animate
window.HTMLElement.prototype.animate = function() {
    return { onfinish: null, finished: Promise.resolve() };
};

try {
    window.eval(js);
    console.log("Script executed successfully.");

    // Simulate DOMContentLoaded
    const event = document.createEvent('Event');
    event.initEvent('DOMContentLoaded', true, true);
    document.dispatchEvent(event);

    console.log("DOMContentLoaded dispatched.");
    
    // Simulate tap on intro overlay
    const overlay = document.getElementById('intro-overlay');
    console.log("Overlay found:", !!overlay);
    if (overlay) {
        const clickEvent = document.createEvent('Event');
        clickEvent.initEvent('click', true, true);
        overlay.dispatchEvent(clickEvent);
        console.log("Click dispatched to overlay");
    }

} catch (e) {
    console.error("Execution error:", e);
}
