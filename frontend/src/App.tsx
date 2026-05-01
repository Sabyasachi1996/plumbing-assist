import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';

export default function App() {
  const isAuthenticated = !!localStorage.getItem('companyId');

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Auth /> : <Navigate to="/" />} />
        <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}