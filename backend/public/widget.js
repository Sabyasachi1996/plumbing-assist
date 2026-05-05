(function() {
  // 1. INJECT THE CSS
  const styles = `
    #plumber-chat-widget { position: fixed; bottom: 20px; right: 20px; width: 350px; height: 500px; background: white; border: 1px solid #ccc; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: flex; flex-direction: column; font-family: sans-serif; z-index: 9999; }
    #chat-header { background: #007bff; color: white; padding: 15px; border-radius: 10px 10px 0 0; font-weight: bold; }
    #chat-messages { flex-grow: 1; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    .msg { padding: 8px 12px; border-radius: 15px; max-width: 80%; word-wrap: break-word; }
    .msg.user { background: #e9ecef; align-self: flex-end; }
    .msg.bot { background: #007bff; color: white; align-self: flex-start; }
    #chat-controls { padding: 10px; border-top: 1px solid #ccc; display: flex; gap: 5px; }
    #chat-input { flex-grow: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
    #chat-send { background: #007bff; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
  `;
  const styleTag = document.createElement('style');
  styleTag.innerHTML = styles;
  document.head.appendChild(styleTag);

  // 2. INJECT THE HTML
  const widgetHtml = `
    <div id="plumber-chat-widget">
      <div id="chat-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span>Plumbing Assistant</span>
        <button id="ai-call-btn" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">📞 Call Support</button>
      </div>
      <div id="chat-messages"></div>
      <div id="chat-controls">
        <input type="file" id="chat-file" accept="image/*" style="display:none;">
        <button id="chat-camera-btn" style="cursor:pointer;" title="Attach Image">📷</button>
        <input type="text" id="chat-input" placeholder="Describe your issue...">
        <button id="chat-send">Send</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', widgetHtml);

  // 3. WIDGET LOGIC
  const messagesContainer = document.getElementById('chat-messages');
  const inputField = document.getElementById('chat-input');
  const fileField = document.getElementById('chat-file');
  const sendBtn = document.getElementById('chat-send');

    const cameraBtn = document.getElementById('chat-camera-btn');

  // Grab the company ID from the script tag
  const scriptTag = document.currentScript;
  const companyId = scriptTag.getAttribute('data-company-id');
  const BACKEND_URL = new URL(scriptTag.src).origin;
  // 🔒 UNIVERSAL SESSION ID LOCK
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  let chatSessionId = localStorage.getItem('chatSessionId');
  if (!chatSessionId) {
    chatSessionId = generateUUID();
    localStorage.setItem('chatSessionId', chatSessionId);
  }
  // Trigger the hidden file input when the camera button is clicked
  cameraBtn.addEventListener('click', () => {
    fileField.click();
  });

  // UX enhancement: Tell the user the image is ready to send
  fileField.addEventListener('change', () => {
    if (fileField.files.length > 0) {
      cameraBtn.style.backgroundColor = '#28a745'; // Turn green
      inputField.placeholder = "Image attached! Add text...";
    } else {
      cameraBtn.style.backgroundColor = '';
      inputField.placeholder = "Describe your issue...";
    }
  });

  function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${sender}`;
    msgDiv.innerText = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async function sendMessage() {
    const text = inputField.value.trim();
    const file = fileField.files[0];
    
    if (!text && !file) return;

    // Show the user what they sent
    addMessage(text ? text : "[Image Uploaded]", 'user');
    
    // Reset the inputs and UI immediately
    inputField.value = '';
    fileField.value = '';
    cameraBtn.style.backgroundColor = '';
    inputField.placeholder = "Describe your issue...";

    // Prepare FormData
    const formData = new FormData();
    formData.append('companyId', companyId);
    if (text) formData.append('message', text);
    if (file) formData.append('image', file);

    let sessionId = localStorage.getItem('chatSessionId');
    if (sessionId) formData.append('sessionId', sessionId);

    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/chat`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      
      addMessage(data.reply || data.error, 'bot');
      if (data.sessionId) localStorage.setItem('chatSessionId', data.sessionId);
    } catch (error) {
      addMessage("Error connecting to server.", 'bot');
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

  addMessage("Hi! Describe your plumbing issue or upload a photo, and I'll help you book a pro.", 'bot');
  // --- UPGRADED RETELL AI VOICE LOGIC ---
  
  const callButton = document.getElementById('ai-call-btn');
  let retellWebClient = null;

  // Use dynamic ES Module import (Points to the jsdelivr CDN you already whitelisted!)
  import('https://esm.sh/retell-client-js-sdk')
    .then((module) => {
      console.log("✅ Retell SDK loaded successfully!");
      retellWebClient = new module.RetellWebClient();
      
      retellWebClient.on("call_started", () => console.log("🎙️ Audio stream active!"));
      retellWebClient.on("call_ended", () => endVoiceCall());
    })
    .catch((error) => {
      console.error("❌ Failed to download Retell SDK:", error);
    });

  async function startVoiceCall() {
    console.log("📞 Call button was clicked!"); // Debug log

    if (!retellWebClient) {
      console.error("Cannot start call: retellWebClient is still null.");
      alert("The audio system is still loading or was blocked. Check the console!");
      return;
    }
    
    try {
      callButton.innerText = "Connecting...";
      callButton.disabled = true;

      let sessionId = localStorage.getItem('chatSessionId');

      console.log(`Asking backend for token at: ${BACKEND_URL}/api/v1/voice/create-web-call`);

      // 1. Ask your backend for the access token
      const response = await fetch(`${BACKEND_URL}/api/v1/voice/create-web-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: sessionId, 
          companyId: companyId 
        })
      });
      
      if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Backend rejected token request: ${errData}`);
      }
      
      const data = await response.json();
      console.log("✅ Token received from backend!");
      isCallActive = true;
      // 2. Pass token to Retell
      await retellWebClient.startCall({
        accessToken: data.accessToken,
      });

      callButton.innerText = "🛑 End Call";
      callButton.disabled = false;

    } catch (error) {
      console.error("❌ Call initialization failed:", error);
      callButton.innerText = "Call Failed";
      setTimeout(() => {
        callButton.innerText = "📞 Call Support";
        callButton.disabled = false;
      }, 3000);
    }
  }

  let isCallActive = false; // Add this variable above the function

  function endVoiceCall() {
    if (!isCallActive) return; // Prevent infinite loops!
    
    console.log("🛑 Ending call...");
    isCallActive = false;
    
    if (retellWebClient) {
      retellWebClient.stopCall();
    }
    
    callButton.innerText = "📞 Call Support";
    callButton.disabled = false;    
    // Trigger chat sync so the booking ID appears on the screen!
    syncChatHistory(); 
  }
  async function syncChatHistory() {
    try {
      const sessionId = localStorage.getItem('chatSessionId');
      const response = await fetch(`${BACKEND_URL}/api/v1/chat/history?sessionId=${sessionId}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Clear the visual chat box
        messagesContainer.innerHTML = '';
        
        // Re-render everything from the database
        data.history.forEach(msg => {
          if (msg.role !== 'system') {
            const sender = msg.role === 'user' ? 'user' : 'bot';
            addMessage(msg.content, sender);
          }
        });
      }
    } catch (error) {
      console.log("Could not sync chat history visually.");
    }
  }
  callButton.onclick = () => {
    if (isCallActive) {
      endVoiceCall();
    } else {
      startVoiceCall();
    }
  };
})();