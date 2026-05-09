import { ArrowRight, Bot, Zap, ShieldCheck } from 'lucide-react';

export default function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-4xl w-full text-center space-y-8 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 text-blue-300 font-medium text-sm border border-blue-500/30">
          <Zap size={16} /> Welcome to the future of dispatch
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
          Meet <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Xynsis AI</span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
          The autonomous voice and text dispatch assistant that gathers issues, analyzes photos, and books appointments while you sleep.
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8">
          <button 
            onClick={onGetStarted}
            className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 transition-all text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-500/30"
          >
            Create Free Sandbox <ArrowRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 text-left">
          {[
            { icon: <Bot size={24}/>, title: "Multi-Modal AI", desc: "Seamlessly switches between Voice and Text chat." },
            { icon: <ShieldCheck size={24}/>, title: "Zero Hallucination", desc: "Strict state-machine limits AI to professional boundaries." },
            { icon: <Zap size={24}/>, title: "Native UI Integrations", desc: "Pulls up forms and payment modals automatically." }
          ].map((feature, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl">
              <div className="text-blue-400 mb-4">{feature.icon}</div>
              <h3 className="font-bold text-xl mb-2">{feature.title}</h3>
              <p className="text-slate-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}