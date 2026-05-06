import React, { useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../App';

// 1. Define the exact shape of our Sandbox Request
interface SandboxFormData {
  name: string;
  businessTypeId: string;
  description: string;
  startTime: string;
  endTime: string;
  email: string;
  phone: string;
}

// 2. Define the expected Backend Response
interface SandboxResponse {
  success?: boolean;
  organizationId?: string;
  demoScriptTag?: string;
  error?: string;
}

export default function LandingForm(): JSX.Element {
  const navigate = useNavigate();
  
  // Apply the interface to the state
  const [formData, setFormData] = useState<SandboxFormData>({
    name: 'Super Mario Plumbing',
    businessTypeId: '123e4567-e89b-12d3-a456-426614174000', // Replace with your actual UUID
    description: 'We fix pipes and save princesses.',
    startTime: '08:00',
    endTime: '18:00',
    email: 'mario@example.com',
    phone: '555-0198'
  });

  // Type the form submission event
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/organizations/sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data: SandboxResponse = await res.json();
      
      if (data.success && data.demoScriptTag && data.organizationId) {
        localStorage.setItem('demoScriptTag', data.demoScriptTag);
        localStorage.setItem('organizationId', data.organizationId);
        navigate('/demo'); 
      } else {
        alert(data.error || 'Failed to generate sandbox');
      }
    } catch (err) {
      console.error(err);
      alert('Server error connecting to backend.');
    }
  };

  // Helper for typed input changes
  const handleChange = (field: keyof SandboxFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6">
      <div className="bg-white p-8 rounded-xl shadow-md border border-gray-200">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Grow Your Home Service Business</h2>
        <p className="text-gray-600 mb-6">Let AI handle your intake. Try it right now, free for 15 minutes.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <input className="w-full p-3 border rounded" type="text" placeholder="Business Name" 
            value={formData.name} onChange={handleChange('name')} required />
          
          <input className="w-full p-3 border rounded" type="text" placeholder="Business Type ID (UUID)" 
            value={formData.businessTypeId} onChange={handleChange('businessTypeId')} required />
          
          <div className="flex gap-4">
            <input className="w-1/2 p-3 border rounded" type="email" placeholder="Email" 
              value={formData.email} onChange={handleChange('email')} required />
            <input className="w-1/2 p-3 border rounded" type="tel" placeholder="Phone" 
              value={formData.phone} onChange={handleChange('phone')} required />
          </div>

          <div className="flex gap-4">
            <div className="w-1/2">
              <label className="block text-sm text-gray-600 mb-1">Open Time</label>
              <input className="w-full p-3 border rounded" type="time" 
                value={formData.startTime} onChange={handleChange('startTime')} required />
            </div>
            <div className="w-1/2">
              <label className="block text-sm text-gray-600 mb-1">Close Time</label>
              <input className="w-full p-3 border rounded" type="time" 
                value={formData.endTime} onChange={handleChange('endTime')} required />
            </div>
          </div>

          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded hover:bg-blue-700 transition">
            Try Yourself (Sandbox Demo)
          </button>
        </form>
      </div>
    </div>
  );
}