import React, { useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../App';

// Define the expected Backend Response for the confirmation endpoint
interface RegistrationResponse {
  success?: boolean;
  productionScriptTag?: string;
  error?: string;
}

export default function FinalizeRegistration(): JSX.Element {
  const navigate = useNavigate();
  const organizationId: string | null = localStorage.getItem('organizationId');

  // Type the state variables
  const [provider, setProvider] = useState<string>('google');
  const [mockRefreshToken, setMockRefreshToken] = useState<string>('mock_1/xxxxx_refresh_token_xxxxx');
  const [paymentUrl, setPaymentUrl] = useState<string>('https://buy.stripe.com/test_123');

  const handleConfirm = async (): Promise<void> => {
    if (!organizationId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/organizations/confirm-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organizationId,
          calendarProvider: provider,
          calendarRefreshToken: mockRefreshToken,
          paymentUrl: paymentUrl
        })
      });
      
      const data: RegistrationResponse = await res.json();
      
      if (data.success && data.productionScriptTag) {
        alert("Registration Complete! Your permanent script is: \n\n" + data.productionScriptTag);
        navigate('/'); 
      } else {
        alert(data.error || "Registration failed.");
      }
    } catch (err) {
      alert('Error confirming registration.');
      console.error(err);
    }
  };

  if (!organizationId) {
    return <div className="p-10 text-center text-red-500 font-bold">Error: No Sandbox Session Found. Please go back to the start.</div>;
  }

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-xl shadow-md border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Complete Registration</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Select Calendar Provider</label>
          <select 
            className="w-full p-3 border rounded" 
            value={provider} 
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProvider(e.target.value)}
          >
            <option value="google">Google Calendar</option>
            <option value="microsoft">Microsoft Outlook</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Simulated Refresh Token (From Frontend OAuth)</label>
          <input 
            className="w-full p-3 border rounded bg-gray-100" 
            type="text" 
            value={mockRefreshToken} 
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMockRefreshToken(e.target.value)} 
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Stripe Payment Link URL</label>
          <input 
            className="w-full p-3 border rounded" 
            type="url" 
            value={paymentUrl} 
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaymentUrl(e.target.value)} 
          />
        </div>

        <button 
          onClick={handleConfirm}
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded mt-4 hover:bg-blue-700 transition"
        >
          Confirm & Get Permanent Widget
        </button>
      </div>
    </div>
  );
}