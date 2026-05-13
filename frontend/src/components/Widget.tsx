import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Phone, X, Send, Image as ImageIcon, Check, Bot, PhoneOff } from 'lucide-react';
import { RetellWebClient } from 'retell-client-js-sdk';

const BACKEND_URL = 'http://localhost:8080'; // Update this for production
const WS_URL = BACKEND_URL.replace(/^http/, 'ws');

interface Message {
  text: string;
  sender: 'user' | 'bot';
}
interface InputField {
  label: string;
  keyboard_type: 'text' | 'emailAddress' | 'phone';
}

type UiState = 
  | { type: 'NONE' | 'UPLOAD' | 'ENDED' }
  | { type: 'SLOTS'; data: { date: string, slots: string[] } }
  | { type: 'INPUT'; data: InputField[] }
  | { type: 'PAYMENT'; data: { amount: number; trackingToken: string } };

type WidgetMode = 'selection' | 'text' | 'voice';

export default function Widget({ orgId, sessionId }: { orgId: string, sessionId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<WidgetMode>('selection');
  const [messages, setMessages] = useState<Message[]>([{ text: "Hi! Describe your plumbing issue or upload a photo, and I'll help you book a pro.", sender: 'bot' }]);
  const [inputText, setInputText] = useState("");
  const [uiState, setUiState] = useState<UiState>({ type: 'NONE' });
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const retellClientRef = useRef<RetellWebClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/api/v2/widget/ws?sessionId=${sessionId}&orgId=${orgId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      
      if (payload.action === 'CHAT_REPLY') {
        setMessages(prev => [...prev, { text: payload.reply, sender: 'bot' }]);
      } 
      else if (payload.action === 'TRIGGER_IMAGE_UPLOAD') {
        setUiState({ type: 'UPLOAD' });
      } 
      else if (payload.action === 'SHOW_SLOT_PICKER') {
        setUiState({ type: 'SLOTS', data: payload.data });
      }
      else if (payload.action === 'TAKE_INPUT') {
        setUiState({ type: 'INPUT', data: payload.data });
      } 
      else if (payload.action === 'SHOW_PAYMENT_MODAL') {
        setUiState({ type: 'PAYMENT', data: payload.data });
      } 
      else if (payload.action === 'END_CHAT') {
        setUiState({ type: 'ENDED' });
        if (retellClientRef.current) {
          retellClientRef.current.stopCall();
        }
      }
    };

    retellClientRef.current = new RetellWebClient();
    retellClientRef.current.on('call_ended', () => {
      setUiState({ type: 'ENDED' });
    });

    return () => { ws.close(); retellClientRef.current?.stopCall(); };
  }, [orgId, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, uiState]);

  const sendTextMessage = async (text: string, isSystemMsg = false) => {
    if (!text && !selectedImage) return;
    
    if (!isSystemMsg) {
      setMessages(prev => [...prev, { text: selectedImage ? "[Image Attached] " + text : text, sender: 'user' }]);
    }
    
    setInputText("");
    setUiState({ type: 'NONE' });

    let base64Image = null;
    let mimeType = null;
    if (selectedImage) {
      mimeType = selectedImage.type;
      base64Image = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(selectedImage);
      });
      setSelectedImage(null);
    }

    wsRef.current?.send(JSON.stringify({
      action: "INCOMING_CHAT",
      message: text,
      image: base64Image,
      mimeType: mimeType
    }));
  };

  const startVoiceCall = async () => {
    setMode('voice');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/voice/create-web-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, companyId: orgId }) 
      });
      const data = await res.json();
      await retellClientRef.current?.startCall({ accessToken: data.accessToken });
    } catch (e) {
      console.log(e);
      alert("Failed to connect voice stream.");
      setMode('selection');
    }
  };

  const endVoiceCall = () => {
    retellClientRef.current?.stopCall();
    setUiState({ type: 'ENDED' });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="bg-white w-[350px] h-[550px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-8rem)] rounded-2xl shadow-2xl border border-slate-200 mb-4 flex flex-col overflow-hidden relative">
          
          {/* Header */}
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center z-10 relative shadow-md">
            <div>
              <h3 className="font-bold">Support Agent</h3>
              <p className="text-blue-100 text-xs flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${uiState.type === 'ENDED' ? 'bg-slate-400' : 'bg-green-400 animate-pulse'}`}></span> 
                {uiState.type === 'ENDED' ? 'Offline' : 'Online'}
              </p>
            </div>
          </div>

          {/* ========================================================= */}
          {/* GLOBAL HIDDEN FILE INPUT (Available for Voice & Text)     */}
          {/* ========================================================= */}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              setUiState({ type: 'NONE' });
              setSelectedImage(null); 
              setMessages(prev => [...prev, { text: "[Image Attached]", sender: 'user' }]);

              const mimeType = file.type;
              
              // FIX: Reverted to your original code to strip the prefix!
              const base64Image = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(file);
              });

              wsRef.current?.send(JSON.stringify({
                action: "INCOMING_CHAT",
                message: "",
                image: base64Image, // Now it's purely the raw base64 string
                mimeType: mimeType
              }));

              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />

          {/* ========================================================= */}
          {/* STATE 1: SELECTION GATEWAY (Fixed Layout)                 */}
          {/* ========================================================= */}
          {mode === 'selection' && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4 bg-slate-50 overflow-y-auto">
              <div className="text-center space-y-2 mb-4">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Bot size={32} />
                </div>
                <h3 className="font-bold text-xl text-slate-800">Need a plumber?</h3>
                <p className="text-sm text-slate-500">Choose how you would like to connect.</p>
              </div>
              
              <div className="w-full space-y-3">
                <button 
                  onClick={() => setMode('text')} 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-sm transition flex items-center justify-center gap-2"
                >
                  <MessageSquare size={18} /> Start Text Chat
                </button>
                <button 
                  onClick={startVoiceCall} 
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-sm transition flex items-center justify-center gap-2"
                >
                  <Phone size={18} /> Start Voice Call
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 2: VOICE CALL INTERFACE                             */}
          {/* ========================================================= */}
          {mode === 'voice' && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 space-y-8 relative">
              {uiState.type === 'ENDED' ? (
                 <div className="text-center space-y-3 mb-8">
                    <div className="w-20 h-20 bg-slate-200 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                      <PhoneOff size={32} />
                    </div>
                    <h3 className="font-bold text-2xl text-slate-700">Call Ended</h3>
                 </div>
              ) : (
                <>
                  <div className="relative flex items-center justify-center mt-4">
                    <div className="absolute w-32 h-32 bg-emerald-400/20 rounded-full animate-ping"></div>
                    <div className="absolute w-24 h-24 bg-emerald-400/40 rounded-full animate-pulse"></div>
                    <div className="relative bg-emerald-500 text-white p-6 rounded-full shadow-xl">
                      <Bot size={48} />
                    </div>
                  </div>
                  
                  <div className="text-center mt-6 mb-8">
                    <h3 className="font-bold text-xl text-slate-800">Call in Progress</h3>
                    <p className="text-slate-500 text-sm">AI Assistant is listening...</p>
                  </div>

                  <button 
                    onClick={endVoiceCall} 
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition flex items-center gap-2"
                  >
                    <PhoneOff size={20} /> End Call
                  </button>
                </>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 3: TEXT CHAT INTERFACE                              */}
          {/* ========================================================= */}
          {mode === 'text' && (
            <>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.sender === 'user' ? 'bg-blue-600 text-white rounded-br-sm shadow-sm' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm shadow-sm'}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 relative z-0">
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={uiState.type !== 'NONE'} 
                  className={`p-2 rounded-xl transition ${selectedImage ? 'bg-green-100 text-green-600' : 'text-slate-400 hover:bg-slate-100'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <ImageIcon size={20} />
                </button>
                
                <input 
                  disabled={uiState.type !== 'NONE'}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendTextMessage(inputText)}
                  type="text" 
                  placeholder={uiState.type === 'ENDED' ? "Chat session ended." : uiState.type !== 'NONE' ? "Action required above..." : selectedImage ? "Image attached. Add text..." : "Type your message..."}
                  className="flex-1 p-2 outline-none text-sm disabled:bg-transparent disabled:cursor-not-allowed"
                />
                
                <button 
                  disabled={uiState.type !== 'NONE'} 
                  onClick={() => sendTextMessage(inputText)} 
                  className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                >
                  <Send size={18} />
                </button>
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* THE GLOBAL ACTION DRAWER (Overlays Voice AND Text!)       */}
          {/* ========================================================= */}
          {uiState.type !== 'NONE' && uiState.type !== 'ENDED' && mode !== 'selection' && (
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] z-20 animate-in slide-in-from-bottom-2 rounded-b-2xl max-h-[85%] overflow-y-auto">
              
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Action Required</span>
                <button 
                  onClick={() => setUiState({ type: 'NONE' })} 
                  className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full transition"
                >
                  <X size={14} />
                </button>
              </div>
              
              {uiState.type === 'UPLOAD' && (
                <div className="text-center">
                  <button onClick={() => fileInputRef.current?.click()} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-xl font-medium transition flex items-center justify-center gap-2 border border-slate-200">
                    <ImageIcon size={18} /> Select Image
                  </button>
                </div>
              )}

              {uiState.type === 'SLOTS' && (
                <div className="text-center mt-1">
                  <p className="text-sm font-bold text-slate-800 mb-1">Pick a Time Slot</p>
                  <p className="text-xs text-slate-500 mb-3">Availability for {uiState.data.date}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {uiState.data.slots.map((slot: string, i: number) => (
                      <button key={i} onClick={() => sendTextMessage(`[SYSTEM_SLOT_SELECTED] ${slot}`, true)} className="bg-blue-50  hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 text-xs font-bold py-3 rounded-xl transition shadow-sm">
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              )}  

              {uiState.type === 'INPUT' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  let resultStr = "[SYSTEM_DETAILS_SUBMITTED] ";
                  uiState.data.forEach((field: InputField) => {
                     resultStr += `${field.label}: ${formData.get(field.label)}, `;
                  });
                  sendTextMessage(resultStr, true); 
                }} className="space-y-3">
                  {uiState.data.map((field: InputField, i: number) => (
                    <input key={i} required name={field.label} type={field.keyboard_type === 'emailAddress' ? 'email' : field.keyboard_type === 'phone' ? 'tel' : 'text'} placeholder={field.label} className="w-full text-sm p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                  ))}
                  <button type="submit" className="w-full bg-blue-600 text-white text-sm font-bold py-3 rounded-xl hover:bg-blue-700 transition mt-1">Submit Details</button>
                </form>
              )}

              {uiState.type === 'PAYMENT' && (
                <div className="text-center pb-2">
                  <p className="text-xs text-slate-500 mb-4 mt-2">Please pay the advance fee to confirm your slot.</p>
                  <button onClick={() => {
                    sendTextMessage("[SYSTEM_PAYMENT_SUCCESSFUL]", true);
                  }} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-xl transition flex justify-center items-center gap-2 shadow-sm">
                    <Check size={18} /> Pay Advance (${uiState.data.amount})
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Bubble Toggle */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-transform"
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </div>
  );
}