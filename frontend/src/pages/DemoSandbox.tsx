import  { useEffect, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../App'; // <-- 1. Import your Ngrok URL from App

export default function DemoSandbox(): JSX.Element {
  const navigate = useNavigate();

  useEffect(() => {
    const scriptString: string | null = localStorage.getItem('demoScriptTag');
    let injectedScript: HTMLScriptElement | null = null;
    
    if (scriptString) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(scriptString, 'text/html');
      const scriptElement: HTMLScriptElement | null = doc.querySelector('script');
      
      if (scriptElement && scriptElement.src) {
        injectedScript = document.createElement('script');
        
        // 🔥 THE FIX: Intercept and rewrite the URL
        // We grab just the path (e.g., "/widget-demo.js") from whatever the backend sent
        // and force it to use our known Ngrok API_BASE_URL.
        const scriptPath = new URL(scriptElement.src).pathname;
        injectedScript.src = `${API_BASE_URL}${scriptPath}`;
        
        const orgId = scriptElement.getAttribute('data-org-id');
        if (orgId) {
          injectedScript.setAttribute('data-org-id', orgId);
        }
        
        document.body.appendChild(injectedScript);
      }
    }

    // Cleanup: This runs when you navigate away from the Demo page
    return () => {
      if (injectedScript && document.body.contains(injectedScript)) {
        document.body.removeChild(injectedScript);
      }
      
      const widget = document.getElementById('plumber-chat-widget');
      if (widget) widget.remove();

      const styles = document.querySelectorAll('style');
      styles.forEach(style => {
        if (style.innerHTML.includes('#plumber-chat-widget')) {
          style.remove();
        }
      });
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-20">
      <div className="max-w-3xl text-center">
        <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">Live Sandbox</span>
        <h1 className="text-4xl font-extrabold text-gray-900 mt-4 mb-2">Welcome to your Demo Page</h1>
        <p className="text-lg text-gray-600 mb-8">
          The Xynsis AI widget has been injected into the bottom right corner of this screen. 
          It will expire in exactly 15 minutes.
        </p>

        <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
          <h3 className="text-xl font-bold mb-4">Ready to go live?</h3>
          <p className="text-gray-600 mb-4">If you love how the AI handles the intake, you can complete your registration to get the permanent widget for your actual website.</p>
          <button 
            onClick={() => navigate('/register')}
            className="bg-green-600 text-white font-bold py-3 px-6 rounded hover:bg-green-700 transition"
          >
            Complete Full Registration
          </button>
        </div>
      </div>
    </div>
  );
}