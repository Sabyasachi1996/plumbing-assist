import { useState } from 'react';
import type{ OrganizationData } from '../App';
import Widget from './Widget';
import { CheckCircle2, FlaskConical, LayoutDashboard } from 'lucide-react';

const API_BASE = "https://moltenly-undeflective-carol.ngrok-free.dev/api/v2"/*'http://localhost:8080/api/v2'*/; 

export default function Playground({ orgData, sessionId, onReset }: { orgData: OrganizationData, sessionId: string, onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/organizations/confirm-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',"ngrok-skip-browser-warning": "69420" },
        body: JSON.stringify({
          organizationId: orgData.id,
          paymentUrl: "https://stripe.com/fake-url",
          calendarProvider: "google",
          calendarRefreshToken: "demo_token"
        })
      });
      const result = await res.json();
      if(result.success) {
        alert("Registration Confirmed! Welcome to Production.");
        onReset();
      }
    } catch (e) {
      console.log(e);
      alert("Error confirming registration");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 text-amber-600 p-3 rounded-xl"><FlaskConical size={28} /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{orgData.name} Workspace</h1>
              <p className="text-slate-500 text-sm">Sandbox Environment Active (Expires in 15 mins)</p>
            </div>
          </div>
          <button 
            onClick={handleConfirm} disabled={confirming}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-green-500/20"
          >
            <CheckCircle2 size={20} /> {confirming ? "Confirming..." : "Confirm Registration"}
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-8 min-h-[60vh] flex flex-col items-center justify-center text-center">
            <LayoutDashboard size={64} className="text-slate-300 mb-4" />
            <h2 className="text-xl font-bold text-slate-700 mb-2">Test the AI Assistant</h2>
            <p className="text-slate-500 max-w-md">
              Interact with the widget in the bottom right corner. Try booking an appointment, uploading a photo, or switching to a live voice call.
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-fit">
            <h3 className="font-bold text-lg mb-4 text-slate-800">Organization Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2"><span className="text-slate-500">Org ID:</span> <span className="font-mono text-xs">{orgData.id.split('-')}...</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-slate-500">Email:</span> <span>{orgData.email}</span></div>
              <div className="flex justify-between pb-2"><span className="text-slate-500">Phone:</span> <span>{orgData.phone}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* THE MAGIC WIDGET */}
      <Widget orgId={orgData.id} sessionId={sessionId} />
    </div>
  );
}