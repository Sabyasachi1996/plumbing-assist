(function() {
  const existingWidget = document.getElementById('plumber-chat-widget');
  if (existingWidget) existingWidget.remove();

  const styles = `
    #plumber-chat-widget { position: fixed; bottom: 20px; right: 20px; width: 350px; height: 500px; background: white; border: 1px solid #ccc; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: flex; flex-direction: column; font-family: sans-serif; z-index: 9999; overflow: hidden; }
    #chat-header { background: #007bff; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
    #chat-messages { flex-grow: 1; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; position: relative; }
    .msg { padding: 8px 12px; border-radius: 15px; max-width: 80%; word-wrap: break-word; }
    .msg.user { background: #e9ecef; align-self: flex-end; }
    .msg.bot { background: #007bff; color: white; align-self: flex-start; }
    #chat-controls { padding: 10px; border-top: 1px solid #ccc; display: flex; gap: 5px; background: white; }
    #chat-input { flex-grow: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
    #chat-send { background: #007bff; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
    #ui-popups { display: none; position: absolute; bottom: 60px; left: 10px; right: 10px; background: rgba(255,255,255,0.95); border: 1px solid #007bff; border-radius: 8px; padding: 15px; box-shadow: 0 -4px 10px rgba(0,0,0,0.1); z-index: 100; flex-direction: column; gap: 8px; }
    .slot-btn { background: white; border: 1px solid #007bff; color: #007bff; padding: 8px; border-radius: 5px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .slot-btn:hover { background: #007bff; color: white; }
    .pay-btn { background: #28a745; color: white; border: none; padding: 12px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 16px; transition: 0.2s; }
    .pay-btn:hover { background: #218838; }
  `;
  const styleTag = document.createElement('style');
  styleTag.innerHTML = styles;
  document.head.appendChild(styleTag);

  const widgetHtml = `
    <div id="plumber-chat-widget">
      <div id="chat-header">
        <span>Xynsis AI (Sandbox)</span>
        <button id="ai-call-btn" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">📞 Call Support</button>
      </div>
      <div id="chat-messages"></div>
      <div id="ui-popups"></div> 
      <div id="chat-controls">
        <input type="file" id="chat-file" accept="image/*" style="display:none;">
        <button id="chat-camera-btn" style="cursor:pointer; background:none; border:none; font-size:18px;" title="Attach Image">📷</button>
        <input type="text" id="chat-input" placeholder="Describe your issue...">
        <button id="chat-send">Send</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', widgetHtml);

  const messagesContainer = document.getElementById('chat-messages');
  const popupsContainer = document.getElementById('ui-popups');
  const inputField = document.getElementById('chat-input');
  const fileField = document.getElementById('chat-file');
  const sendBtn = document.getElementById('chat-send');
  const cameraBtn = document.getElementById('chat-camera-btn');
  const callButton = document.getElementById('ai-call-btn');

  const scriptTag = document.currentScript;
  const orgId = scriptTag ? scriptTag.getAttribute('data-org-id') : null;
  const BACKEND_URL = scriptTag ? new URL(scriptTag.src).origin : '';

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  let chatSessionId = localStorage.getItem('demoChatSessionId') || generateUUID();
  localStorage.setItem('demoChatSessionId', chatSessionId);

  function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${sender}`;
    msgDiv.innerText = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // ==========================================
  // 1. WEBSOCKET TEXT CHAT LOGIC
  // ==========================================
  const wsUrl = BACKEND_URL.replace(/^http/, 'ws') + `/api/v2/widget/ws?sessionId=${chatSessionId}&orgId=${orgId}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    
    if (payload.action === 'CHAT_REPLY') {
      addMessage(payload.reply, 'bot');
    }
    else if (payload.action === 'TRIGGER_IMAGE_UPLOAD') {
      try {
        fileField.click(); // Attempt the silent programmatic click first
      } catch (e) {}
      
      // Fallback UI popup: Forces a physical click to bypass browser security during Voice Calls
      popupsContainer.style.display = 'flex';
      popupsContainer.innerHTML = `
        <span style="font-size:14px; font-weight:bold; color:#333; margin-bottom:5px;">Please provide a photo:</span>
        <button class="pay-btn" id="manual-upload-btn" style="background:#007bff;">📸 Select Image</button>
      `;
      document.getElementById('manual-upload-btn').onclick = () => {
        fileField.click();
      };
    } 
    else if (payload.action === 'SHOW_SLOT_PICKER') {
      popupsContainer.style.display = 'flex';
      popupsContainer.innerHTML = '<span style="font-size:14px; font-weight:bold; color:#333; margin-bottom:5px;">Pick an Available Slot:</span>';
      payload.data.slots.forEach(slot => {
        const btn = document.createElement('button');
        btn.className = 'slot-btn';
        btn.innerText = slot;
        btn.onclick = () => { sendMessage(slot); popupsContainer.style.display = 'none'; };
        popupsContainer.appendChild(btn);
      });
    }
    else if (payload.action === 'SHOW_PAYMENT_MODAL') {
      popupsContainer.style.display = 'flex';
      popupsContainer.innerHTML = `
        <span style="font-size:14px; color:#333; margin-bottom:5px;">To secure this booking, please pay the advance fee.</span>
        <button class="pay-btn">Pay Advance ($${payload.data.amount})</button>
      `;
      popupsContainer.querySelector('.pay-btn').onclick = () => {
        alert("Payment Successful! Tracking Token: " + payload.data.trackingToken);
        popupsContainer.style.display = 'none';
        sendMessage("Payment is completed."); 
      };
    }
  };

  cameraBtn.onclick = () => fileField.click();

  fileField.onchange = () => {
    if (fileField.files && fileField.files.length > 0) {
      cameraBtn.style.backgroundColor = '#28a745'; 
      cameraBtn.style.borderRadius = '4px';
      inputField.placeholder = "Image attached! Add text...";
      popupsContainer.style.display = 'none'; // Ensure the fallback popup closes
    }
  };

  async function sendMessage(forceText) {
    const text = typeof forceText === 'string' ? forceText : inputField.value.trim();
    const file = fileField.files ? fileField.files[0] : null;
    
    if (!text && !file) return;
    if (ws.readyState !== WebSocket.OPEN) return alert("Connecting to chat... please wait.");

    addMessage(text ? text : "[Image Uploaded]", 'user');
    
    inputField.value = ''; cameraBtn.style.backgroundColor = ''; inputField.placeholder = "Describe your issue...";

    let base64Image = null;
    let mimeType = null;
    if (file) {
      mimeType = file.type;
      base64Image = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]); 
        reader.readAsDataURL(file);
      });
    }

    ws.send(JSON.stringify({
      action: "INCOMING_CHAT",
      message: text,
      image: base64Image,
      mimeType: mimeType
    }));
    
    fileField.value = '';
  }

  sendBtn.onclick = () => sendMessage();
  inputField.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

  addMessage("Hi! Describe your plumbing issue or upload a photo, and I'll help you book a pro.", 'bot');

  // ==========================================
  // 2. RETELL AI VOICE LOGIC (Restored)
  // ==========================================
  let retellWebClient = null;
  let isCallActive = false;

  import('https://esm.sh/retell-client-js-sdk')
    .then((module) => {
      console.log("✅ Retell SDK loaded successfully!");
      retellWebClient = new module.RetellWebClient();
      retellWebClient.on("call_started", () => console.log("🎙️ Audio stream active!"));
      retellWebClient.on("call_ended", () => endVoiceCall());
    })
    .catch((error) => console.error("❌ Failed to download Retell SDK:", error));

  async function startVoiceCall() {
    if (!retellWebClient) {
      alert("Voice system is still loading. Please try again in a few seconds.");
      return;
    }
    try {
      callButton.innerText = "Connecting...";
      callButton.disabled = true;

      // Notice we are passing orgId instead of companyId to match V2 variables!
      const response = await fetch(`${BACKEND_URL}/api/v1/voice/create-web-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: chatSessionId, 
          companyId: orgId 
        })
      });
      
      if (!response.ok) throw new Error("Backend rejected token request");
      
      const data = await response.json();
      isCallActive = true;
      await retellWebClient.startCall({ accessToken: data.accessToken });

      callButton.innerText = "🛑 End Call";
      callButton.disabled = false;
    } catch (error) {
      console.error("Call init failed:", error);
      callButton.innerText = "Call Failed";
      setTimeout(() => {
        callButton.innerText = "📞 Call Support";
        callButton.disabled = false;
      }, 3000);
    }
  }

  function endVoiceCall() {
    if (!isCallActive) return;
    isCallActive = false;
    if (retellWebClient) retellWebClient.stopCall();
    
    callButton.innerText = "📞 Call Support";
    callButton.disabled = false;    
    syncChatHistory(); 
  }

  // Pull history after hanging up to show what the AI discussed over the phone
  async function syncChatHistory() {
    try {
      // NOTE: Make sure your Express backend still has the GET /api/v1/chat/history route active!
      const response = await fetch(`${BACKEND_URL}/api/v1/chat/history?sessionId=${chatSessionId}`);
      if (response.ok) {
        const data = await response.json();
        messagesContainer.innerHTML = '';
        data.history.forEach(msg => {
          if (msg.role !== 'system') {
            const sender = msg.role === 'user' ? 'user' : 'bot';
            addMessage(msg.content, sender);
          }
        });
      }
    } catch (error) {
      console.log("Visual chat sync unavailable.");
    }
  }

  callButton.onclick = () => {
    if (isCallActive) endVoiceCall();
    else startVoiceCall();
  };
})();