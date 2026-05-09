import { useState } from 'react';
import LandingPage from './components/LandingPage';
import SandboxForm from './components/SandboxForm';
import Playground from './components/Playground';

export type AppState = 'LANDING' | 'REGISTER' | 'PLAYGROUND';

export interface OrganizationData {
  id: string;
  name: string;
  email: string;
  phone: string;
  businessTypeId: string;
}

function App() {
  const [currentView, setCurrentView] = useState<AppState>('LANDING');
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [sessionId, setSessionId] = useState<string>('');

  const navigateTo = (view: AppState) => setCurrentView(view);

  const handleSandboxCreated = (data: OrganizationData, newSessionId: string) => {
    setOrgData(data);
    setSessionId(newSessionId);
    setCurrentView('PLAYGROUND');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-200">
      {currentView === 'LANDING' && <LandingPage onGetStarted={() => navigateTo('REGISTER')} />}
      
      {currentView === 'REGISTER' && (
        <SandboxForm 
          onBack={() => navigateTo('LANDING')} 
          onSuccess={handleSandboxCreated} 
        />
      )}
      
      {currentView === 'PLAYGROUND' && orgData && (
        <Playground 
          orgData={orgData} 
          sessionId={sessionId} 
          onReset={() => {
            setOrgData(null);
            setCurrentView('LANDING');
          }} 
        />
      )}
    </div>
  );
}

export default App;