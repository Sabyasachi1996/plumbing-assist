import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingForm from './pages/LandingForm';
import DemoSandbox from './pages/DemoSandbox';
import FinalizeRegistration from './pages/FinalizeRegistration';
import type { JSX } from 'react';

// Explicitly type the URL string
export const API_BASE_URL: string = "https://moltenly-undeflective-carol.ngrok-free.dev";

export default function App(): JSX.Element {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingForm />} />
        <Route path="/demo" element={<DemoSandbox />} />
        <Route path="/register" element={<FinalizeRegistration />} />
      </Routes>
    </Router>
  );
}