import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { OrganizationData } from '../App';

// Update this to your actual backend URL
const API_BASE = 'https://moltenly-undeflective-carol.ngrok-free.dev/api/v2';//'http://localhost:8080/api/v2'; 
interface BusinessType {
  id: string;
  name: string;
}
export default function SandboxForm({ onBack, onSuccess }: { onBack: () => void, onSuccess: (data: OrganizationData, sessionId: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([]);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', businessTypeId: '', description: '' });

  useEffect(() => {
    fetch(`${API_BASE}/organizations/business-types`,{ headers: { 'Content-Type': 'application/json',"ngrok-skip-browser-warning": "69420" }})
      .then(res => res.json())
      .then(data => setBusinessTypes(data.data || []))
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/organizations/sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',"ngrok-skip-browser-warning": "69420" },
        body: JSON.stringify(formData)
      });
      const result = await res.json();
      
      if (result.success) {
        // Generate a random session ID for the demo
        const demoSessionId = `demo_${Math.random().toString(36).substring(7)}`;
        onSuccess({ ...formData, id: result.organizationId }, demoSessionId);
      } else {
        alert(result.error || result.message);
      }
    } catch (error) {
        console.log(error);
      alert("Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white max-w-md w-full p-8 rounded-2xl shadow-xl border border-slate-100">
        <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-800 mb-6 transition-colors">
          <ArrowLeft size={16} className="mr-2" /> Back
        </button>
        
        <h2 className="text-3xl font-bold mb-2 text-slate-800">Generate Sandbox</h2>
        <p className="text-slate-500 mb-6">Enter your details to spin up an isolated AI environment.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Organization Name</label>
            <input required type="text" className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Mario Plumbing" onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input required type="email" className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input required type="tel" className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" onChange={e => setFormData({...formData, phone: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business Type</label>
            <select required className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" onChange={e => setFormData({...formData, businessTypeId: e.target.value})}>
              <option value="">Select Type...</option>
              {businessTypes.map(bt => <option key={bt.id} value={bt.id}>{bt.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Brief Description</label>
            <textarea className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" rows={3} placeholder="What do you do?" onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
          </div>
          
          <button disabled={loading} type="submit" className="w-full bg-slate-900 text-white font-bold py-3 rounded-lg hover:bg-slate-800 transition flex justify-center items-center">
            {loading ? <Loader2 className="animate-spin" /> : "Enter Playground"}
          </button>
        </form>
      </div>
    </div>
  );
}