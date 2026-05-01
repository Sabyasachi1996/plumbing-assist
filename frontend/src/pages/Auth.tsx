import { useState } from 'react';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');

 const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/v1/auth/login' : '/api/v1/auth/register';
    
    try {
      const res = await fetch(`http://localhost:8080${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Now sending the actual dynamic name and description
        body: JSON.stringify({ email, password, name, description }) 
      });
      
      const data = await res.json();
      if (data.companyId) {
        localStorage.setItem('companyId', data.companyId);
        window.location.href = '/'; 
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch (err) {
      console.log(err);
      alert('Server error');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-24 p-6">
      <div className="bg-white p-8 rounded-xl shadow-md">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
          {isLogin ? 'Organization Login' : 'Register Company'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            required 
          />
          <input 
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
          {!isLogin && (
            <>
              <input 
                className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                type="text" 
                placeholder="Company Name" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
              <textarea 
                className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="Briefly describe your company services..." 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                required 
                rows={3}
              />
            </>
          )}
          <button 
            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded hover:bg-blue-700 transition" 
            type="submit"
          >
            {isLogin ? 'Login' : 'Sign Up'}
          </button>
        </form>
        <p 
          className="text-center mt-4 text-blue-600 cursor-pointer hover:underline" 
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Need an account? Sign up" : "Have an account? Login"}
        </p>
      </div>
    </div>
  );
}